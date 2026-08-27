import { BRAND } from "@karda/shared/brand";
import { t } from "../_i18n/catalog";
import { shell } from "../_i18n/messages/shell";
import { HomeClient } from "./home-client";

// 首页(KD-214,owner 2026-08-27)。
//
// 此前 `/` 就是知识资产总览,依据是「资产为核,首页即知识资产」。那条裁定改了:
// 重心仍是资产,变的是**第一屏的职责**——它现在要回答「这套基础设施此刻能不能用」,
// 而那不是一个资产问题。把两件事钉在同一个路由上,让第二件没有地方说。
//
// 见 docs/30-design/150-page-architecture §2。资产总览搬到了 /assets。
//
// 标题在默认语言下解析——与其他页同一条限制,见 TD-014。
export const metadata = {
  title: `${t(shell.navHome, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

export default function HomePage() {
  return <HomeClient />;
}
