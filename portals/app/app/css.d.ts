// Side-effect CSS imports (DS globals/fonts, KD-020). Next.js compiles them;
// this declaration is only for `tsc --noEmit`, which otherwise rejects the
// import specifier (TS2882).
declare module "*.css";
