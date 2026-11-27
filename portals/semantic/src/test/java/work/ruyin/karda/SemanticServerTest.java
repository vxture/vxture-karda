package work.ruyin.karda;
import com.google.gson.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

final class SemanticServerTest {
 @TempDir Path directory;
 static String key="a".repeat(64),secret="synthetic-semantic-internal-secret";
 static JsonObject request(String operation){JsonObject q=new JsonObject();q.addProperty("operation",operation);q.addProperty("key",key);return q;}
 static JsonObject build(){JsonObject q=request("build");q.addProperty("data",SemanticRuntimeTest.edge(11,1,2)+SemanticRuntimeTest.edge(12,2,3)+SemanticRuntimeTest.edge(13,3,4));q.addProperty("shapes","");return q;}
 static String relation(int n){return "urn:karda:relation:"+SemanticRuntimeTest.KB+":00000000-0000-0000-0000-"+String.format("%012d",n);}
 static JsonObject query(int... ids){JsonObject q=request("query");JsonArray allowed=new JsonArray();for(int id:ids)allowed.add(relation(id));q.add("allowed",allowed);JsonArray seeds=new JsonArray();seeds.add(SemanticRuntimeTest.entity(1));q.add("seeds",seeds);q.addProperty("hops",4);q.addProperty("direction","both");q.addProperty("limit",100);q.addProperty("after","");return q;}
 @Test void persistedDatasetReopensAndHiddenEdgeCannotBridge(){
  try(SemanticServer service=new SemanticServer(directory.toString(),secret)){service.execute(build());assertEquals(3,service.execute(query(11,12,13)).getAsJsonArray("edgeIds").size());assertEquals(1,service.execute(query(11,13)).getAsJsonArray("edgeIds").size());}
  try(SemanticServer reopened=new SemanticServer(directory.toString(),secret)){assertTrue(reopened.execute(request("status")).get("ready").getAsBoolean());assertEquals(3,reopened.execute(query(11,12,13)).getAsJsonArray("edgeIds").size());reopened.execute(request("delete"));assertThrows(IllegalArgumentException.class,()->reopened.execute(query(11)));}
 }
 @Test void directedTraversalAndPagingUseOnlyAuthorizedStoredRelations(){
  try(SemanticServer service=new SemanticServer(directory.toString(),secret)){
   service.execute(build());JsonObject q=query(11,12,13);q.addProperty("direction","in");assertEquals(0,service.execute(q).getAsJsonArray("edgeIds").size());
   q.addProperty("direction","out");q.addProperty("limit",1);JsonObject first=service.execute(q);assertTrue(first.get("truncated").getAsBoolean());assertEquals(relation(11),first.getAsJsonArray("edgeIds").get(0).getAsString());
   q.addProperty("after",relation(11));assertEquals(relation(12),service.execute(q).getAsJsonArray("edgeIds").get(0).getAsString());
   JsonObject invalid=query(99);assertThrows(IllegalArgumentException.class,()->service.execute(invalid));
   JsonObject empty=build();empty.addProperty("key","b".repeat(64));empty.addProperty("data","");service.execute(empty);JsonObject status=request("status");status.addProperty("key","b".repeat(64));assertTrue(service.execute(status).get("ready").getAsBoolean());
  }
 }
}
