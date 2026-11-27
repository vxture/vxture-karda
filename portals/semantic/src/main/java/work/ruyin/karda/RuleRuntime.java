package work.ruyin.karda;
import com.google.gson.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import org.apache.jena.rdf.model.*;
import org.apache.jena.graph.Triple;
import org.apache.jena.reasoner.*;
import org.apache.jena.reasoner.rulesys.*;

/** Fixed finite Datalog templates executed by Jena, never caller code or rule source. */
public final class RuleRuntime {
 static final String K=SemanticRuntime.K;
 static String predicate(String type){return "urn:karda:predicate:"+Base64.getUrlEncoder().withoutPadding().encodeToString(type.getBytes(StandardCharsets.UTF_8));}
 static String key(Triple triple){return triple.toString();}
 static boolean trace(InfModel inferred,Triple triple,Map<String,List<String>> facts,Set<String> seen,Set<String> premises,Set<String> rules,int depth){
  List<String> direct=facts.get(key(triple));if(direct!=null){premises.addAll(direct);return premises.size()<=32;}
  if(depth>16||!seen.add(key(triple)))return false;
  java.util.Iterator<Derivation> derivations=inferred.getDerivation(inferred.asStatement(triple));
  while(derivations!=null&&derivations.hasNext()){
   Derivation value=derivations.next();if(!(value instanceof RuleDerivation d))continue;
   Set<String> local=new TreeSet<>(),localRules=new TreeSet<>();boolean valid=true;
   for(Triple premise:d.getMatches())if(!trace(inferred,premise,facts,new HashSet<>(seen),local,localRules,depth+1)){valid=false;break;}
   if(valid&&local.size()<=32){premises.addAll(local);rules.addAll(localRules);rules.add(d.getRule().getName());return premises.size()<=32;}
  }return false;
 }
 public static JsonObject execute(JsonObject input){
  JsonArray rows=input.getAsJsonArray("rules");if(rows==null||rows.size()>20)throw new IllegalArgumentException("graph_rule_invalid");
  Model reified=SemanticRuntime.model(SemanticRuntime.text(input,"data",2*1024*1024)),facts=ModelFactory.createDefaultModel();
  Map<String,List<String>> premises=new HashMap<>();Map<String,String> types=new HashMap<>(),ruleNames=new HashMap<>();
  try{
   if(input.has("shapes")){
    Model shapes=SemanticRuntime.model(SemanticRuntime.text(input,"shapes",2*1024*1024));
    InfModel classification=ModelFactory.createRDFSModel(ModelFactory.createDefaultModel().add(reified));
    try{if(!org.apache.jena.shacl.ShaclValidator.get().validate(org.apache.jena.shacl.Shapes.parse(shapes.getGraph()),classification.getGraph()).conforms())throw new IllegalArgumentException("graph_constraint_violation");}finally{classification.close();shapes.close();}
   }
   var relations=reified.listResourcesWithProperty(org.apache.jena.vocabulary.RDF.type,reified.createResource(K+"Relation")).toList();
   if(relations.size()>200)throw new IllegalArgumentException("graph_rule_budget");Set<String> entities=new HashSet<>();
   for(Resource relation:relations){Resource source=relation.getPropertyResourceValue(reified.createProperty(K+"source")),target=relation.getPropertyResourceValue(reified.createProperty(K+"target"));String type=relation.getProperty(reified.createProperty(K+"relationType")).getString();
    Property p=facts.createProperty(predicate(type));types.put(p.getURI(),type);Statement statement=facts.createStatement(source,p,target);facts.add(statement);premises.computeIfAbsent(key(statement.asTriple()),k->new ArrayList<>()).add(relation.getURI());entities.add(source.getURI());entities.add(target.getURI());
   }if(entities.size()>100)throw new IllegalArgumentException("graph_rule_budget");
   List<Rule> compiled=new ArrayList<>();int count=0;
   for(JsonElement value:rows){JsonObject r=value.getAsJsonObject();String id=SemanticRuntime.text(r,"id",80),kind=SemanticRuntime.text(r,"kind",16),a=predicate(SemanticRuntime.text(r,"input",128)),out=predicate(SemanticRuntime.text(r,"output",128)),name="rule"+count++;
    types.put(out,SemanticRuntime.text(r,"output",128));ruleNames.put(name,id);
    String body;
    if(kind.equals("inverse"))body="(?x <"+a+"> ?y) -> (?y <"+out+"> ?x)";
    else if(kind.equals("compose")||kind.equals("transitive")){String b=kind.equals("transitive")?out:predicate(SemanticRuntime.text(r,"second",128));body="(?x <"+a+"> ?y) (?y <"+b+"> ?z) -> (?x <"+out+"> ?z)";
     if(kind.equals("transitive")&&!a.equals(out))throw new IllegalArgumentException("graph_rule_invalid");
    }else throw new IllegalArgumentException("graph_rule_invalid");
    compiled.add(Rule.parseRule("["+name+": "+body+"]"));
   }
   GenericRuleReasoner reasoner=new GenericRuleReasoner(compiled);reasoner.setMode(GenericRuleReasoner.FORWARD_RETE);reasoner.setDerivationLogging(true);
   InfModel inferred=ModelFactory.createInfModel(reasoner,facts);inferred.prepare();
   try{
    JsonArray results=new JsonArray();boolean truncated=false;
    var deductions=inferred.getDeductionsModel().listStatements();
    while(deductions.hasNext()){Statement statement=deductions.next();if(!types.containsKey(statement.getPredicate().getURI())||!statement.getObject().isResource()||facts.contains(statement))continue;
     if(results.size()>=500){truncated=true;break;}
     Set<String> support=new TreeSet<>(),used=new TreeSet<>();if(!trace(inferred,statement.asTriple(),premises,new HashSet<>(),support,used,0)||support.isEmpty())continue;
     JsonObject result=new JsonObject();result.addProperty("source",statement.getSubject().getURI());result.addProperty("target",statement.getResource().getURI());result.addProperty("type",types.get(statement.getPredicate().getURI()));
     JsonArray grounds=new JsonArray();support.forEach(grounds::add);result.add("premiseIds",grounds);JsonArray refs=new JsonArray();used.forEach(x->refs.add(ruleNames.get(x)));result.add("ruleIds",refs);results.add(result);
    }
    JsonObject result=SemanticServer.ok();result.add("inferences",results);result.addProperty("truncated",truncated);return result;
   }finally{inferred.close();}
  }finally{reified.close();facts.close();}
 }
}
