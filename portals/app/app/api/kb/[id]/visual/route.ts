import {visualHttp} from '../../../../kb/visual/http';
export const dynamic='force-dynamic';
async function handle(req:Request,ctx:{params:Promise<{id:string}>}){return visualHttp(req,(await ctx.params).id);}
export const GET=handle;export const POST=handle;
