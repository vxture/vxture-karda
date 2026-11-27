package work.ruyin.karda;
import com.google.gson.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

final class SemanticRuntimeTest {
  static final String K="urn:karda:vocab:",RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#",SH="http://www.w3.org/ns/shacl#";
  static final String KB="00000000-0000-0000-0000-000000000001";
  static String entity(int n){return "urn:karda:entity:"+KB+":00000000-0000-0000-0000-"+String.format("%012d",n);}
  static String edge(int n,int a,int b){String id="urn:karda:relation:"+KB+":00000000-0000-0000-0000-"+String.format("%012d",n);
    return "<"+id+"> <"+RDF+"type> <"+K+"Relation> .\n<"+id+"> <"+K+"source> <"+entity(a)+"> .\n<"+id+"> <"+K+"target> <"+entity(b)+"> .\n";}
  static JsonObject request(){
    JsonObject input=new JsonObject();input.addProperty("operation","validate");
    input.addProperty("data",edge(11,1,2)+edge(12,2,3)+edge(13,3,4));
    input.addProperty("shapes","_:s <"+SH+"targetClass> <"+K+"Relation> .\n_:s <"+SH+"property> _:p .\n_:p <"+SH+"path> <"+K+"source> .\n_:p <"+SH+"minCount> \"1\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n");
    return input;
  }
  @Test void shaclReportsRealConstraintViolation(){
    JsonObject input=request();assertTrue(SemanticRuntime.execute(input).get("conforms").getAsBoolean());
    input.addProperty("data","<urn:missing> <"+RDF+"type> <"+K+"Relation> .\n");
    JsonObject report=SemanticRuntime.execute(input);assertFalse(report.get("conforms").getAsBoolean());assertEquals(1,report.getAsJsonArray("issues").size());
  }
  @Test void parameterizedQueryHonorsHopBoundaryAndActualDirections(){
    JsonObject input=request();input.addProperty("operation","neighbors");input.addProperty("seed",entity(1));input.addProperty("hops",1);
    assertEquals(1,SemanticRuntime.execute(input).getAsJsonArray("edgeIds").size());
    input.addProperty("hops",2);assertEquals(2,SemanticRuntime.execute(input).getAsJsonArray("edgeIds").size());
    input.addProperty("seed",entity(4));assertEquals(2,SemanticRuntime.execute(input).getAsJsonArray("edgeIds").size());
    input.addProperty("seed",entity(99));assertEquals(0,SemanticRuntime.execute(input).getAsJsonArray("edgeIds").size());
  }
  @Test void rejectsCallerQueryAndInvalidSeed(){
    JsonObject input=request();input.addProperty("operation","SELECT");assertThrows(IllegalArgumentException.class,()->SemanticRuntime.execute(input));
    input.addProperty("operation","neighbors");input.addProperty("hops",1);input.addProperty("seed","https://example.com/> SERVICE <https://example.com>");
    assertThrows(IllegalArgumentException.class,()->SemanticRuntime.execute(input));
  }
}
