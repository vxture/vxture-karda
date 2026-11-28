import {NextResponse} from 'next/server';
import {requireAuth} from '../../kb/api/http';
import {userAdmission} from '../../platform/admission';
import {reviewOriginAllowed} from '../../kb/semantic/review-request';
import {getOidcConfig} from '../../auth/lib/config';
import {visualKnowledgeTool} from '../../kb/visual/read';
import {visualBody} from '../../kb/visual/http';
import {failure} from '../../kb/visual/contract';
export const dynamic='force-dynamic';
export async function POST(req:Request){const headers={'Cache-Control':'private, no-store'};try{const auth=await requireAuth('data.read');if(!auth.ok)return auth.response;if(!reviewOriginAllowed(req,getOidcConfig().appOrigin)||!req.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'origin_invalid'},{status:403,headers});if(!(await userAdmission(auth.user)).allowed)return NextResponse.json({error:'visual_denied'},{status:403,headers});const r=await visualKnowledgeTool({mode:'obo',workspace:auth.user.activeWorkspace,user:auth.user.sub,org:auth.user.activeOrg??null,callerProduct:'karda',productAccess:auth.user.productAccess},await visualBody(req));return NextResponse.json(r.body,{status:r.status,headers});}catch(e){const f=failure(e);return NextResponse.json({error:f.code},{status:f.status,headers});}}
