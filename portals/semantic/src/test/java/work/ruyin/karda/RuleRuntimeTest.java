package work.ruyin.karda;
import com.google.gson.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
final class RuleRuntimeTest {
 static JsonObject input(boolean complete){JsonObject q=new JsonObject();String data=SemanticRuntimeTest.edge(11,1,2)+(complete?SemanticRuntimeTest.edge(12,2,3):"");
  data+="<"+SemanticServerTest.relation(11)+"> <urn:karda:vocab:relationType> \"part_of\" .\n";
  if(complete)data+="<"+SemanticServerTest.relation(12)+"> <urn:karda:vocab:relationType> \"part_of\" .\n";
  q.addProperty("data",data);JsonArray rules=new JsonArray();JsonObject r=new JsonObject();r.addProperty("id","containment");r.addProperty("kind","transitive");r.addProperty("input","part_of");r.addProperty("output","part_of");rules.add(r);q.add("rules",rules);return q;}
 @Test void actualJenaReasoningHasPremisesAndWithdrawalRemovesConclusion(){JsonObject result=RuleRuntime.execute(input(true));assertEquals(1,result.getAsJsonArray("inferences").size());JsonObject inference=result.getAsJsonArray("inferences").get(0).getAsJsonObject();assertEquals(2,inference.getAsJsonArray("premiseIds").size());assertEquals("containment",inference.getAsJsonArray("ruleIds").get(0).getAsString());assertEquals(SemanticRuntimeTest.entity(3),inference.get("target").getAsString());assertEquals(0,RuleRuntime.execute(input(false)).getAsJsonArray("inferences").size());}
 @Test void arbitraryCodeIsNotAnAcceptedRuleKind(){JsonObject q=input(true);q.getAsJsonArray("rules").get(0).getAsJsonObject().addProperty("kind","java");assertThrows(IllegalArgumentException.class,()->RuleRuntime.execute(q));}
}
