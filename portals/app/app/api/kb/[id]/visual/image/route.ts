import {visualHttp} from '../../../../../kb/visual/http';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return visualHttp(req,(await ctx.params).id,true);}
