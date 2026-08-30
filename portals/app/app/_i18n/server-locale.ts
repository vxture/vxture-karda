import { cookies } from "next/headers";
import { BRAND } from "@karda/shared/brand";
import type { Locale } from "@vxture/shared";
import { t, type Message } from "./catalog";
import { LOCALE_COOKIE, isLocale } from "./locale-cookie";

// 服务端一侧的 locale(TD-014 的收口)。
//
// 偏好本体在客户端(localStorage + LocaleProvider);cookie 是它的**服务端副本**,
// 由 locale.tsx 在每次切换时同步写入。这里读不到 cookie(首次访问、或清过站点数据)
// 就落回产品默认——与客户端 Provider 的默认同一个值,两边不会各说各话。
//
// 读 cookies() 使路由动态化;本仓的页面全部 force-dynamic,没有静态化损失。

export async function serverLocale(): Promise<Locale> {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : BRAND.defaultLocale;
}

/**
 * 一页的浏览器标签标题,跟随用户语言。
 *
 * 每个 page.tsx 此前是 `export const metadata = { title: t(msg, BRAND.defaultLocale) }`
 * ——静态 metadata 在服务端求值而 locale 在客户端,标题因此永远钉死默认语言
 * (TD-014)。换成 generateMetadata + 这里的 cookie 读取,五处「一个 locale 参数」
 * 的债一次清掉。
 */
export async function pageTitle(msg: Message): Promise<{ title: string }> {
  const locale = await serverLocale();
  return { title: `${t(msg, locale)} - ${BRAND.displayName}` };
}
