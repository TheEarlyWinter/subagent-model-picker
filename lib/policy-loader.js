let counter = 0;

// Hana fresh-imports contribution entry files but Node may retain their static
// dependencies across a development reload. Load policy code per invocation.
export function loadModelPolicy() {
  const url = new URL("./model-policy.js", import.meta.url);
  url.searchParams.set("t", `${Date.now()}-${counter++}`);
  return import(url.href);
}
