/**
 * Destroy only the operations RP session before accounts logout.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {cookies} from 'next/headers';
import {operationsConfig} from '../../lib/config';
import {completeLogout} from '../../../auth/lib/logout-response';
import {deleteSession} from '../../../auth/lib/session-store';
import {randomToken} from '../../../auth/lib/pkce';
export async function POST(req:Request){const cfg=operationsConfig();if(req.headers.get('origin')!==cfg.appOrigin)return new Response('forbidden',{status:403});return completeLogout(cfg,(await cookies()).get(cfg.cookieName)?.value,{deleteSession,state:()=>randomToken(16)});}
