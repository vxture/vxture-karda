package work.ruyin.karda;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.apache.jena.query.*;
import org.apache.jena.rdf.model.*;
import org.apache.jena.riot.*;
import org.apache.jena.shacl.*;

/** Bounded, request-isolated Jena execution. No endpoints, disk, remote RDF or caller SPARQL. */
public final class SemanticRuntime {
  static final String K = "urn:karda:vocab:";
  static final int MAX_BYTES = 2 * 1024 * 1024;
  static final Gson JSON = new Gson();
  static Model model(String nt) {
    Model result = ModelFactory.createDefaultModel();
    RDFParser.fromString(nt,Lang.NTRIPLES).parse(result);
    if (result.size() > 50000) throw new IllegalArgumentException("semantic_rdf_budget");
    return result;
  }
  static String text(JsonObject input, String key, int max) {
    JsonElement item = input.get(key);
    if (item == null || !item.isJsonPrimitive() || !item.getAsJsonPrimitive().isString())
      throw new IllegalArgumentException("semantic_invalid_request");
    String value = item.getAsString();
    if (value.length() > max) throw new IllegalArgumentException("semantic_rdf_budget");
    return value;
  }
  public static JsonObject execute(JsonObject input) {
    String operation = text(input,"operation",32);
    if (!operation.equals("validate") && !operation.equals("neighbors"))
      throw new IllegalArgumentException("semantic_invalid_operation");
    Model data = model(text(input,"data",MAX_BYTES));
    Model shapes = model(text(input,"shapes",MAX_BYTES));
    try {
      ValidationReport report = ShaclValidator.get().validate(Shapes.parse(shapes.getGraph()),data.getGraph());
      JsonObject result = new JsonObject();
      result.addProperty("format","karda.jena-result.v1");
      result.addProperty("engine","apache-jena");
      result.addProperty("version","6.3.0");
      result.addProperty("conforms",report.conforms());
      JsonArray issues = new JsonArray();
      report.getEntries().stream().limit(100).forEach(entry -> {
        JsonObject issue = new JsonObject();
        issue.addProperty("focus",entry.focusNode().toString());
        issue.addProperty("path",entry.resultPath() == null ? "" : entry.resultPath().toString());
        issue.addProperty("message",entry.message());
        issues.add(issue);
      });
      result.add("issues",issues);
      result.addProperty("issuesTruncated",report.getEntries().size()>100);
      if (operation.equals("neighbors")) {
        if (!report.conforms()) throw new IllegalArgumentException("semantic_shacl_invalid");
        String seed=text(input,"seed",512);
        if(!seed.matches("urn:karda:entity:[a-f0-9-]{36}:[a-f0-9-]{36}"))
          throw new IllegalArgumentException("semantic_invalid_seed");
        int hops=input.get("hops").getAsInt();
        if(hops<1||hops>4)throw new IllegalArgumentException("semantic_invalid_hops");
        String link="(^<"+K+"source>/<"+K+"target>|^<"+K+"target>/<"+K+"source>)";
        StringBuilder paths=new StringBuilder();
        for(int depth=0;depth<hops;depth++){
          if(depth>0)paths.append(" UNION ");
          paths.append("{ ");
          if(depth==0)paths.append("BIND(<").append(seed).append("> AS ?node) ");
          else paths.append("<").append(seed).append("> ").append(String.join("/",java.util.Collections.nCopies(depth,link))).append(" ?node . ");
          paths.append("}");
        }
        String query="SELECT DISTINCT ?edge WHERE { { "+paths+" } ?edge a <"+K+"Relation> . { { ?edge <"+K+"source> ?node } UNION { ?edge <"+K+"target> ?node } } } ORDER BY ?edge LIMIT 1001";
        JsonArray edges=new JsonArray();
        try(QueryExecution execution=QueryExecution.model(data).query(query).timeout(5,TimeUnit.SECONDS).build()){
          ResultSet rows=execution.execSelect();
          while(rows.hasNext())edges.add(rows.next().getResource("edge").getURI());
        }
        result.addProperty("truncated",edges.size()>1000);
        if(edges.size()>1000)edges.remove(1000);
        result.add("edgeIds",edges);
      }
      return result;
    } finally { data.close(); shapes.close(); }
  }
  public static void main(String[] args) throws IOException {
    byte[] bytes=System.in.readNBytes(MAX_BYTES+1);
    try {
      if(bytes.length>MAX_BYTES)throw new IllegalArgumentException("semantic_rdf_budget");
      JsonObject input=JsonParser.parseString(new String(bytes,StandardCharsets.UTF_8)).getAsJsonObject();
      System.out.print(JSON.toJson(execute(input)));
    }catch(Exception failure){
      System.err.print("semantic_jena_execution_failed");
      System.exit(1);
    }
  }
}
