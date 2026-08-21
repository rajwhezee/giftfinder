/**
 * Serialise a JSON-LD object for injection into a `<script>` tag.
 *
 * `JSON.stringify` escapes quotes and backslashes but leaves `<` and `>`
 * alone, and an HTML parser stops reading a script block at the first
 * `</script` regardless of the JSON around it. Gift names are merchant-supplied
 * (Etsy seller titles, Shopify product titles), so they are untrusted text that
 * reaches this sink directly: the catalogue already carries raw `<br>` tags in
 * fifteen names today, which proves the path is live rather than theoretical.
 * A seller who titled a listing `</script><img src=x onerror=...>` would get
 * that script executed on the occasion page, and the CSP cannot stop it because
 * `script-src` has to allow `unsafe-inline` for Next's own bootstrap.
 *
 * Escaping the angle brackets as \u003c / \u003e keeps the value identical to
 * a JSON parser while making the closing tag unrecognisable to the HTML
 * parser. `&` follows for the same reason in an entity-decoding context.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
