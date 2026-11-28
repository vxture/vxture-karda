import {publicHttp} from '../../kb/public/http';
export const dynamic='force-dynamic';
export async function GET(req:Request){return publicHttp(req);}
export async function POST(req:Request){return publicHttp(req);}
