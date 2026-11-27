package work.ruyin.karda;

import com.google.gson.*;
import com.sun.net.httpserver.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.*;
import org.apache.jena.riot.*;
import org.apache.jena.shacl.*;
import org.apache.jena.tdb2.TDB2Factory;

/** One TDB2 directory owner; internal authenticated fixed operations, never raw SPARQL. */
public final class SemanticServer implements AutoCloseable {
  final Dataset dataset;
  final String secret;
  HttpServer server;
  static final String K=SemanticRuntime.K;
  static final int MAX=16*1024*1024;
  static final Gson JSON=new Gson();
  public SemanticServer(String directory,String secret){
    if(secret==null||secret.length()<16)throw new IllegalArgumentException("semantic_service_secret");
    this.secret=secret;dataset=TDB2Factory.connectDataset(directory);
  }
  static String key(JsonObject input){String k=SemanticRuntime.text(input,"key",64);if(!k.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("semantic_index_key");return "urn:karda:index:"+k;}
  static JsonObject ok(){JsonObject r=new JsonObject();r.addProperty("engine","apache-jena");r.addProperty("version","6.3.0");return r;}
  public synchronized JsonObject execute(JsonObject input){
    String op=SemanticRuntime.text(input,"operation",24);
    if(op.equals("health")){JsonObject r=ok();r.addProperty("ready",true);return r;}
    if(op.equals("infer"))return RuleRuntime.execute(input);
    if(op.equals("list")){
      String after=SemanticRuntime.text(input,"after",64);if(!after.isEmpty()&&!after.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("semantic_index_key");
      dataset.begin(ReadWrite.READ);try{List<String> keys=new ArrayList<>();dataset.listNames().forEachRemaining(n->{if(n.startsWith("urn:karda:index:")){String k=n.substring("urn:karda:index:".length());if(k.compareTo(after)>0)keys.add(k);}});Collections.sort(keys);JsonArray values=new JsonArray();keys.stream().limit(100).forEach(values::add);JsonObject r=ok();r.add("keys",values);return r;}finally{dataset.end();}
    }
    String name=key(input);
    if(op.equals("build")){
      Model data=SemanticRuntime.model(SemanticRuntime.text(input,"data",MAX)),shapes=SemanticRuntime.model(SemanticRuntime.text(input,"shapes",MAX));
      try{
        ValidationReport report=ShaclValidator.get().validate(Shapes.parse(shapes.getGraph()),data.getGraph());
        if(!report.conforms())throw new IllegalArgumentException("semantic_shacl_invalid");
        dataset.begin(ReadWrite.WRITE);try{data.add(data.createResource(name),org.apache.jena.vocabulary.RDF.type,data.createResource(K+"Index"));dataset.replaceNamedModel(name,data);dataset.commit();}finally{dataset.end();}
        JsonObject r=ok();r.addProperty("ready",true);r.addProperty("triples",data.size());return r;
      }finally{data.close();shapes.close();}
    }
    if(op.equals("delete")){dataset.begin(ReadWrite.WRITE);try{dataset.removeNamedModel(name);dataset.commit();}finally{dataset.end();}return ok();}
    dataset.begin(ReadWrite.READ);
    try{
      if(!dataset.containsNamedModel(name))throw new IllegalArgumentException("semantic_index_not_ready");
      if(op.equals("status")){JsonObject r=ok();r.addProperty("ready",true);r.addProperty("triples",dataset.getNamedModel(name).size());return r;}
      if(!op.equals("query"))throw new IllegalArgumentException("semantic_invalid_operation");
      // All relationship IRIs are freshly authorized by the product. Copy their
      // description only; private edges cannot participate in property paths.
      JsonArray allowed=input.getAsJsonArray("allowed");if(allowed==null||allowed.size()>5000)throw new IllegalArgumentException("semantic_scope_budget");
      Model restricted=ModelFactory.createDefaultModel();Model stored=dataset.getNamedModel(name);
      try{
        for(JsonElement item:allowed){String id=item.getAsString();if(!id.matches("urn:karda:relation:[a-f0-9-]{36}:[a-f0-9-]{36}"))throw new IllegalArgumentException("semantic_scope_invalid");
          Resource r=stored.createResource(id);if(!stored.contains(r,org.apache.jena.vocabulary.RDF.type,stored.createResource(K+"Relation")))throw new IllegalArgumentException("semantic_index_changed");
          restricted.add(stored.listStatements(r,null,(RDFNode)null));
        }
        String direction=SemanticRuntime.text(input,"direction",8);if(!List.of("both","out","in").contains(direction))throw new IllegalArgumentException("semantic_direction");
        int hops=input.get("hops").getAsInt(),limit=input.get("limit").getAsInt();if(hops<0||hops>4||limit<1||limit>1000)throw new IllegalArgumentException("semantic_query_budget");
        JsonArray seeds=input.getAsJsonArray("seeds");if(seeds==null||seeds.size()>50)throw new IllegalArgumentException("semantic_query_budget");
        String out="(^<"+K+"source>/<"+K+"target>)",in="(^<"+K+"target>/<"+K+"source>)",link=direction.equals("out")?out:direction.equals("in")?in:"("+out+"|"+in+")";
        String incident=direction.equals("out")?"?edge <"+K+"source> ?node":direction.equals("in")?"?edge <"+K+"target> ?node":"{ ?edge <"+K+"source> ?node } UNION { ?edge <"+K+"target> ?node }";
        String select;
        if(seeds.isEmpty())select="SELECT ?edge WHERE { ?edge a <"+K+"Relation> }";
        else if(hops==0)select="SELECT ?edge WHERE { FILTER(false) }";
        else{
          List<String> parts=new ArrayList<>();
          for(JsonElement seed:seeds){String id=seed.getAsString();if(!id.matches("urn:karda:entity:[a-f0-9-]{36}:[a-f0-9-]{36}"))throw new IllegalArgumentException("semantic_invalid_seed");
            for(int depth=0;depth<hops;depth++)parts.add("{ "+(depth==0?"BIND(<"+id+"> AS ?node)":"<"+id+"> "+String.join("/",Collections.nCopies(depth,link))+" ?node .")+" }");
          }
          select="SELECT DISTINCT ?edge WHERE { { "+String.join(" UNION ",parts)+" } ?edge a <"+K+"Relation> . { "+incident+" } }";
        }
        String after=SemanticRuntime.text(input,"after",512);if(!after.isEmpty()&&!after.matches("urn:karda:relation:[a-f0-9-]{36}:[a-f0-9-]{36}"))throw new IllegalArgumentException("semantic_cursor");
        String query="SELECT ?edge WHERE { { "+select+" } "+(after.isEmpty()?"":"FILTER(STR(?edge)>\""+after+"\")")+" } ORDER BY ?edge LIMIT "+(limit+1);
        JsonArray ids=new JsonArray();
        try(QueryExecution execution=QueryExecution.model(restricted).query(query).timeout(5,TimeUnit.SECONDS).build()){
          ResultSet rows=execution.execSelect();while(rows.hasNext())ids.add(rows.next().getResource("edge").getURI());
        }
        JsonObject r=ok();r.addProperty("truncated",ids.size()>limit);if(ids.size()>limit)ids.remove(limit);r.add("edgeIds",ids);return r;
      }finally{restricted.close();}
    }finally{dataset.end();}
  }
  public void listen(int port)throws IOException{
    server=HttpServer.create(new InetSocketAddress("0.0.0.0",port),16);
    server.setExecutor(new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(16),new ThreadPoolExecutor.AbortPolicy()));
    server.createContext("/internal",exchange->{
      byte[] output;int status=200;
      try{
        String auth=exchange.getRequestHeaders().getFirst("Authorization");
        if(!"POST".equals(exchange.getRequestMethod())||auth==null||!MessageDigest.isEqual(auth.getBytes(StandardCharsets.UTF_8),("Bearer "+secret).getBytes(StandardCharsets.UTF_8))){exchange.sendResponseHeaders(403,-1);exchange.close();return;}
        byte[] body=exchange.getRequestBody().readNBytes(MAX+1);if(body.length>MAX)throw new IllegalArgumentException("semantic_request_budget");
        JsonObject result=execute(JsonParser.parseString(new String(body,StandardCharsets.UTF_8)).getAsJsonObject());output=JSON.toJson(result).getBytes(StandardCharsets.UTF_8);
      }catch(Exception failure){status=503;output="{\"error\":\"semantic_index_unavailable\"}".getBytes(StandardCharsets.UTF_8);}
      exchange.getResponseHeaders().set("Content-Type","application/json");exchange.getResponseHeaders().set("Cache-Control","no-store");exchange.sendResponseHeaders(status,output.length);exchange.getResponseBody().write(output);exchange.close();
    });server.start();
  }
  public void close(){if(server!=null)server.stop(1);dataset.close();}
  public static void main(String[] args)throws Exception{String secret=System.getenv("OIDC_CLIENT_SECRET");SemanticServer service=new SemanticServer(System.getenv().getOrDefault("KARDA_TDB_ROOT","/var/lib/karda/semantic"),secret);Runtime.getRuntime().addShutdownHook(new Thread(service::close));service.listen(8080);}
}
