"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowsOutSimple, Globe, Moon, ShieldCheck, SpinnerGap, User } from "@phosphor-icons/react";
import { useTheme } from "@vxture/design-system";
import { LocaleProvider, useLocale } from "../_shell/locale";
import { isThrough, type AccessState } from "./types";
import { gateView, type GatePhase } from "./view";
import "./confirmed-design.css";
import "./gate.css";

export interface ProductGateProps {
  productName: string;
  destination: string;
  tagline?: string;
}

export function ProductGate(props: ProductGateProps) {
  return <LocaleProvider><Gate {...props} /></LocaleProvider>;
}

function Gate({ destination }: ProductGateProps) {
  const [phase, setPhase] = useState<GatePhase>({ kind: "verifying" });
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  const redirected = useRef(false);
  const en = locale === "en-US";
  const text = (zh: string, english: string) => en ? english : zh;
  const check = useCallback(async () => {
    if (request.current || redirected.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPhase({ kind: "verifying" });
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/access", { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("access unavailable");
      const state = await res.json() as AccessState;
      if (controller.signal.aborted) return;
      if (isThrough(state)) {
        redirected.current = true;
        window.location.replace(destination);
      } else setPhase({ kind: "resolved", state });
    } catch {
      if (request.current === controller) setPhase({ kind: "error" });
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }
  }, [destination]);
  useEffect(() => {
    void check();
    return () => {
      const active = request.current;
      request.current = null;
      active?.abort();
    };
  }, [check]);
  const view = gateView(phase, destination, en);
  const pending = phase.kind === "verifying";
  const login = phase.kind === "resolved" && phase.state.status === "anonymous";
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setNotice(text("\u5f53\u524d\u6d4f\u89c8\u5668\u6682\u4e0d\u652f\u6301\u5168\u5c4f\u3002", "Fullscreen is unavailable in this browser.")); }
  }
  return <div className="karda-entry" data-entry-state={view.state}>
    <div className="cospace-home home-panorama">
      <div className="home-panorama-backdrop" aria-hidden="true"><img className="karda-data-backdrop" src="/entry/karda-background.svg" alt="" /></div>
      <header className="platform-header home-header"><div className="karda-entry-header-inner">
        <div className="platform-product-brand" aria-label="Ruyin / Karda">
          <span className="platform-brand"><img src="/entry/ruyin-mark.svg" alt="" width="24" height="24" /><span>Ruyin</span></span>
          <span className="platform-product-divider" aria-hidden="true" />
          <a className="cospace-brand" href="/" aria-label={text("Karda \u9996\u9875", "Karda home")}><img src="/entry/karda-mark.svg" width="28" height="28" alt="" /><span>Karda</span></a>
        </div>
        <div className="public-header-tools" role="group" aria-label={text("\u663e\u793a\u4e0e\u8bed\u8a00", "Display and language")}>
          <button type="button" aria-label={text("\u5207\u6362\u4e3b\u9898", "Toggle theme")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Moon /></button>
          <button type="button" aria-label={text("\u5207\u6362\u8bed\u8a00", "Toggle language")} onClick={() => setLocale(en ? "zh-CN" : "en-US")}><Globe /></button>
          <button type="button" aria-label={text("\u5168\u5c4f\u663e\u793a", "Fullscreen")} onClick={() => void fullscreen()}><ArrowsOutSimple /></button>
          <a href="https://vxture.com/" target="_blank" rel="noopener noreferrer" aria-label={text("VXTURE \u4e3b\u7ad9\uff08\u65b0\u6807\u7b7e\u9875\uff09", "VXTURE website (new tab)")}><img src="/entry/website-mark.svg" width="16" height="16" alt="" /></a>
        </div>
      </div></header>
      <main className="home-main home-panorama-main"><div className="home-content-inner"><div className="home-panorama-content">
        <p className="home-panorama-eyebrow">AGENT KNOWLEDGE</p>
        <section className="home-entry home-panorama-entry" aria-label={text("Karda \u8bbf\u95ee\u5165\u53e3", "Karda access")}>
          <div className={login ? "home-signin-content" : "entry-status"} aria-busy={pending}>
            <header className="home-login-heading"><p>WELCOME TO KARDA</p><h1 aria-live="polite">{view.title}</h1></header>
            <div className={login ? "home-login-illustration" : "entry-status-body"} aria-hidden="true"><img className="home-login-motif" src="/entry/karda-card-motif.svg" alt="" /></div>
            <div className="entry-core"><div className={login ? "home-login-actions" : "entry-operation-group"}>
              {login && <div className="home-unified-account"><User size={24} /><div><strong>{text("\u5168\u5c40\u7edf\u4e00\u8d26\u53f7", "One platform account")}</strong><p>{text("\u8d26\u53f7\u3001\u5355\u4f4d\u4e0e\u5de5\u4f5c\u7a7a\u95f4\uff0c\u4e00\u5904\u8fde\u63a5", "Account, organization and workspace, connected")}</p></div></div>}
              <div className="entry-actions">
                {pending ? <button className="entry-action" disabled><SpinnerGap className="entry-spinner" size={18} />{text("\u8fde\u63a5\u4e2d\u2026", "Connecting...")}</button> : <>
                  {view.action && <a className="entry-action" href={view.action.href} {...(view.action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{view.action.label}{login && <ArrowRight size={16} />}</a>}
                  {view.retry && <button type="button" className={"entry-action" + (view.action ? " entry-action-secondary" : "")} onClick={() => void check()}>{text("\u91cd\u65b0\u68c0\u67e5", "Check again")}</button>}
                </>}
              </div>
            </div></div>
            <footer className={login ? "home-login-security" : "entry-footnote"} role="status"><ShieldCheck size={16} />{notice || view.hint}</footer>
          </div>
        </section>
        <div className="home-panorama-message"><p>{text("\u8ba9\u77e5\u8bc6\u76f8\u8fde\u3000\u8ba9\u667a\u80fd\u6709\u636e", "CONNECTED KNOWLEDGE. GROUNDED INTELLIGENCE.")}</p><span>CONNECTED KNOWLEDGE. GROUNDED INTELLIGENCE.</span></div>
      </div></div></main>
      <footer className="home-footer public-legal-footer"><div className="home-footer-inner"><span>{"\u00a9 2026 VXTURE \u00b7 RUYIN"}</span><nav aria-label={text("\u6cd5\u5f8b\u4fe1\u606f", "Legal")}>
        <a href="https://vxture.com/legal/terms" target="_blank" rel="noopener noreferrer">{text("\u670d\u52a1\u6761\u6b3e", "Terms of service")}</a>
        <a href="https://vxture.com/legal/privacy" target="_blank" rel="noopener noreferrer">{text("\u9690\u79c1\u653f\u7b56", "Privacy policy")}</a>
        <a href="https://vxture.com/legal/copyright" target="_blank" rel="noopener noreferrer">{text("\u7248\u6743\u58f0\u660e", "Copyright")}</a>
      </nav></div></footer>
    </div>
  </div>;
}
