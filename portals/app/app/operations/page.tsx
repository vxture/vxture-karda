/**
 * Independent product operations front door.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import {operationsConfig} from './lib/config';
import OperationsClient from './operations-client';
export const dynamic='force-dynamic';
export default function OperationsPage(){const cfg=operationsConfig();return <main className="mx-auto max-w-7xl p-8"><header className="mb-6 flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Karda 产品运营与公共知识中心</h1><p>员工身份 · 独立产品授权 · 公共知识归属 Karda</p></div><a href="/">租户工作台</a></header>{cfg.enabled?<OperationsClient/>:<section className="rounded border p-6"><h2>运营认证尚未接通</h2><p>本入口需要独立的 accounts workforce 客户端和显式 Karda 运营授权。平台管理域权限不能代替产品授权。</p><p>请按 Karda 接入清单完成外部登记后启用；当前不接受租户登录。</p></section>}</main>;}
