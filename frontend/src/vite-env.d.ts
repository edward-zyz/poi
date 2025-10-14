/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAODE_KEY: string;
  readonly VITE_GAODE_SECURITY_JS_CODE?: string;
  readonly VITE_AMAP_SERVICE_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
