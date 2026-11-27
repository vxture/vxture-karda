import {knowledgeServiceHttp} from '../../kb/services/http';
export const dynamic='force-dynamic';
export async function GET(req:Request){return knowledgeServiceHttp(req);}
export async function POST(req:Request){return knowledgeServiceHttp(req);}
