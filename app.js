const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const formatDate = (value, locale = "zh-CN") => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date);
};
const formatArticleCount = (count, locale, short = false) => locale === "en"
  ? `${count} ${count === 1 ? 'article' : 'articles'}` : `${count} ${short ? '篇' : '篇文章'}`;

function markdownToHtml(markdown, images = []) {
  const allowedImages = new Set(images.map((image) => image.src));
  const inline = (text) => {
    const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
    let result = "", offset = 0;
    for (const match of text.matchAll(pattern)) {
      result += escapeHtml(text.slice(offset, match.index));
      if (match[2]) result += allowedImages.has(match[2]) ? `<img class="prose-image" src="${escapeHtml(match[2])}" alt="${escapeHtml(match[1])}" loading="lazy" decoding="async">` : escapeHtml(match[1]);
      else if (match[4]) result += `<a href="${escapeHtml(match[4])}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[3])}</a>`;
      else if (match[5]) result += `<strong>${escapeHtml(match[5])}</strong>`;
      else result += `<code>${escapeHtml(match[6])}</code>`;
      offset = match.index + match[0].length;
    }
    return result + escapeHtml(text.slice(offset));
  };
  const output = [];
  let list = "", code = false, codeLines = [];
  const closeList = () => { if (list) { output.push(`</${list}>`); list = ""; } };
  const lines = markdown.replace(/\r/g, "").split("\n");
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const text = line.trim();
    if (text.startsWith("```")) {
      closeList();
      if (code) output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      code = !code; codeLines = []; continue;
    }
    if (code) { codeLines.push(line); continue; }
    if (text.includes('|') && lines[index + 1]?.includes('|')
      && cells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) {
      closeList();
      const header = cells(text);
      output.push(`<div class="table-wrap" tabindex="0"><table><thead><tr>${header.map((cell) => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>`);
      index += 2;
      for (; index < lines.length && lines[index].trim().includes('|'); index++) {
        const row = cells(lines[index]);
        output.push(`<tr>${Array.from({ length: header.length }, (_, i) => `<td>${inline(row[i] || '')}</td>`).join('')}</tr>`);
      }
      index--;
      output.push('</tbody></table></div>');
      continue;
    }
    const item = text.match(/^([-*]|\d+\.)\s+(.+)/);
    if (item) {
      const type = /^\d/.test(item[1]) ? "ol" : "ul";
      if (list !== type) { closeList(); output.push(`<${type}>`); list = type; }
      output.push(`<li>${inline(item[2])}</li>`); continue;
    }
    closeList();
    if (!text) continue;
    const heading = text.match(/^(#{1,6})\s+(.+)/);
    if (heading) { const level = Math.min(heading[1].length + 1, 6); output.push(`<h${level}>${inline(heading[2])}</h${level}>`); }
    else if (/^>\s/.test(text)) output.push(`<blockquote>${inline(text.slice(2))}</blockquote>`);
    else if (/^[-*_]{3,}$/.test(text)) output.push("<hr>");
    else output.push(`<p>${inline(text)}</p>`);
  }
  closeList();
  if (code) output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return output.join("");
}

function init() {
  const data = window.__ARTICLE_DATA__;
  const ui = data.ui;
  const state = { category: document.body.dataset.initialCategory || "all", group: "all", query: "" };
  const $ = (selector) => document.querySelector(selector);
  const categorySite = data.siteMode === "category";
  const byId = new Map(data.articles.map((article) => [article.id, article]));
  const articleGroups = categorySite ? data.groups : data.categories;
  const groupKey = (article) => categorySite ? article.group : article.category;
  const groupName = (article) => categorySite ? article.groupName : article.categoryName;
  const cover = (article, eager) => article.cover
    ? `<img src="${escapeHtml(article.cover)}" alt="${escapeHtml(article.images[0]?.alt || article.title)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : `<div class="cover-placeholder" aria-hidden="true">${escapeHtml(article.categoryName)}</div>`;

  function renderNav() {
    const selected = categorySite ? state.group : state.category;
    const items = [{ key: "all", name: ui.all_articles, count: data.total }, ...articleGroups];
    $("#categoryNav").innerHTML = items.map((item) => `<a class="category-link${selected === item.key ? " active" : ""}" href="${categorySite || item.key === "all" ? 'index' : item.key}.html" data-filter="${escapeHtml(item.key)}"${selected === item.key ? ' aria-current="page"' : ''}><span>${escapeHtml(item.name)}</span><small>${item.count}</small></a>`).join("");
  }

  function card(article, featured, index) {
    const date = formatDate(article.publishedAt, data.locale);
    return `<article class="article-card${featured ? ' article-featured' : ''}"><a class="article-link" href="#article/${article.id}" data-id="${article.id}"><div class="card-media">${cover(article, featured && index === 0)}</div><div class="card-body"><div class="card-meta"><span>${escapeHtml(groupName(article))}</span>${date ? `<time datetime="${escapeHtml(article.publishedAt)}">${date}</time>` : ''}</div><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.summary || article.excerpt || '')}</p><div class="card-footer"><span>${escapeHtml(article.sourceName)}</span><span>${article.readingMinutes} ${escapeHtml(ui.reading_time)} <span aria-hidden="true">↗</span></span></div></div></a></article>`;
  }

  function renderArticles() {
    const query = state.query.trim().toLocaleLowerCase();
    const articles = data.articles.filter((article) => (state.category === "all" || article.category === state.category)
      && (state.group === "all" || article.group === state.group)
      && (!query || `${article.title} ${article.summary} ${article.groupName} ${article.sourceName} ${article.markdown}`.toLocaleLowerCase().includes(query)));
    const filter = categorySite ? state.group : state.category;
    const selected = articleGroups.find((group) => group.key === filter);
    $("#libraryTitle").textContent = selected?.name || (query ? ui.search_results : ui.all_articles);
    $("#resultSummary").textContent = `${formatArticleCount(articles.length, data.locale)}${query ? ` · ${ui.searching} “${state.query.trim()}”` : ''}`;
    document.title = `${selected?.name ? `${selected.name} · ` : ''}${data.siteName}`;
    $("#emptyState").hidden = articles.length > 0;
    const groups = articleGroups.map((group) => ({ group, items: articles.filter((article) => groupKey(article) === group.key) }))
      .filter(({ items }) => items.length);
    const [lead, ...remaining] = groups;
    // Keep the provider-owned ad DOM intact when search or category filters change.
    $("#leadGroup").hidden = !lead;
    $("#leadHeading").innerHTML = lead ? `<div class="group-heading"><h2 id="leadGroupTitle">${escapeHtml(lead.group.name)}</h2><span>${formatArticleCount(lead.items.length, data.locale, true)}</span></div>` : "";
    $("#leadArticle").innerHTML = lead ? card(lead.items[0], true, 0) : "";
    $("#leadRest").innerHTML = lead ? lead.items.slice(1).map((article) => card(article, false, 0)).join('') : "";
    $("#remainingGroups").innerHTML = remaining.map(({ group, items }, index) => {
      return `<section class="article-group" aria-labelledby="group-${group.key}"><div class="group-heading"><h2 id="group-${group.key}">${escapeHtml(group.name)}</h2><span>${formatArticleCount(items.length, data.locale, true)}</span></div><div class="group-list">${items.map((article, position) => card(article, position === 0, index + 1)).join('')}</div></section>`;
    }).join("");
  }

  function openArticle(id) {
    const article = byId.get(id);
    if (!article) return;
    const date = formatDate(article.publishedAt, data.locale);
    const extraImages = article.images.filter((image) => !article.markdown.includes(`](${image.src})`));
    $("#articleDetail").innerHTML = `<header class="detail-head"><p class="detail-topic">${escapeHtml(groupName(article))}</p><h1>${escapeHtml(article.title)}</h1><div><span>${escapeHtml(article.sourceName)}</span>${date ? `<span>${date}</span>` : ''}<span>${article.readingMinutes} ${escapeHtml(ui.reading_time)}</span>${article.author ? `<span>${escapeHtml(article.author)}</span>` : ''}</div></header><div class="article-prose">${markdownToHtml(article.markdown, article.images)}${extraImages.map((image) => `<figure><img class="prose-image" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" loading="lazy" decoding="async"><figcaption>${escapeHtml(image.alt)}</figcaption></figure>`).join('')}</div><a class="source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ui.source_link)} ↗</a>`;
    if (!$("#articleDialog").open) $("#articleDialog").showModal();
    $("#articleDialog").scrollTop = 0;
    document.body.classList.add("dialog-open");
  }

  $("#categoryNav").addEventListener("click", (event) => {
    const link = event.target.closest("[data-filter]");
    if (!link) return;
    event.preventDefault();
    if (categorySite) state.group = link.dataset.filter;
    else state.category = link.dataset.filter;
    renderNav(); renderArticles();
    document.body.classList.remove("nav-open");
    $("#mobileMenu").setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("#articleGroups").addEventListener("click", (event) => {
    const link = event.target.closest("[data-id]");
    if (!link) return;
    event.preventDefault();
    history.replaceState(null, "", `#article/${link.dataset.id}`);
    openArticle(link.dataset.id);
  });
  $("#searchInput").addEventListener("input", (event) => { state.query = event.target.value; renderArticles(); });
  $("#dialogClose").addEventListener("click", () => $("#articleDialog").close());
  $("#articleDialog").addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    if (location.hash.startsWith("#article/")) history.replaceState(null, "", location.pathname + location.search);
  });
  $("#articleDialog").addEventListener("click", (event) => { if (event.target === $("#articleDialog")) $("#articleDialog").close(); });
  $("#mobileMenu").addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    $("#mobileMenu").setAttribute("aria-expanded", String(open));
  });
  renderNav(); renderArticles();
  if (location.hash.startsWith("#article/")) openArticle(location.hash.slice(9));
}

if (typeof module !== "undefined") module.exports = { markdownToHtml, escapeHtml, formatDate, formatArticleCount };
if (typeof window !== "undefined") init();
