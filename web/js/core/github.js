// Minimal GitHub REST client for storing project.json in a repo. Every save is one commit = the audit trail.
// Uses a fine-grained personal access token with "Contents: read/write" on ONE repository. Untested against real GitHub.

const API = "https://api.github.com";

const b64enc = (text) => { const b = new TextEncoder().encode(text); let s = ""; for (const c of b) s += String.fromCharCode(c); return btoa(s); };
const b64dec = (b64) => { const s = atob(b64.replace(/\s/g, "")); return new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0))); };

export class GitHubStore {
  constructor({ owner, repo, branch = "main", path = "project.json", token, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
    Object.assign(this, { owner, repo, branch, path, token, fetchImpl });
  }
  async #call(method, url, body) {
    const res = await this.fetchImpl(API + url, {
      method,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.token}`, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) { const e = new Error(data?.message ?? `GitHub ${res.status}`); e.status = res.status; throw e; }
    return data;
  }
  #contents(p = this.path) { return `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(p).replaceAll("%2F", "/")}`; }

  /** @returns {{text, sha}|null} null when the file does not exist yet */
  async load() {
    try {
      const d = await this.#call("GET", `${this.#contents()}?ref=${encodeURIComponent(this.branch)}`);
      return { text: b64dec(d.content), sha: d.sha };
    } catch (e) { if (e.status === 404) return null; throw e; }
  }
  /** Passing the previous sha makes GitHub refuse the write if someone else committed in between (409). */
  async save(text, message, sha = undefined) {
    const d = await this.#call("PUT", this.#contents(), { message, content: b64enc(text), branch: this.branch, ...(sha ? { sha } : {}) });
    return { sha: d.content.sha, commit: d.commit.sha, url: d.commit.html_url };
  }
  async history(limit = 30) {
    const d = await this.#call("GET", `/repos/${this.owner}/${this.repo}/commits?path=${encodeURIComponent(this.path)}&sha=${encodeURIComponent(this.branch)}&per_page=${limit}`);
    return d.map((c) => ({ sha: c.sha, message: c.commit.message, author: c.commit.author?.name, date: c.commit.author?.date, url: c.html_url }));
  }
  async loadAt(commitSha) {
    const d = await this.#call("GET", `${this.#contents()}?ref=${commitSha}`);
    return b64dec(d.content);
  }
}
