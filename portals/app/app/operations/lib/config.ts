/**
 * Independent workforce relying-party configuration.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {getOidcConfig,type OidcConfig} from '../../auth/lib/config';
export function operationsConfig():OidcConfig {
 const tenant=getOidcConfig(),origin=tenant.appOrigin;
 const clientId=process.env.KARDA_OPS_CLIENT_ID??'';
 const secret=process.env.KARDA_OPS_CLIENT_SECRET??'';
 return {...tenant,clientId,clientSecret:secret,enabled:process.env.KARDA_OPS_ENABLED==='on'&&!!clientId&&!!secret&&clientId!==tenant.clientId,
 redirectUri:origin+'/operations/auth/callback',postLogoutRedirectUri:origin+'/operations',
 scopes:'openid profile email',cookieName:process.env.NODE_ENV==='production'?'__Host-karda_ops':'karda_ops'};
}
export function operationsReturn(value:string|null){return (value==='/operations'||value?.startsWith('/operations/'))&&!value.startsWith('//')&&!value.includes('\\')?value:'/operations';}

/** Pin registered product UUID locally; the API still derives it solely from its client binding. */
export function operationsProductId(){const id=process.env.KARDA_OPS_PRODUCT_ID??'';if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error('operations_not_configured');return id;}
