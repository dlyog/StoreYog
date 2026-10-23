#!/usr/bin/env python3
"""Render research/paper.md as a DLYog Lab paper page (blog repo templates/papers/<slug>.html).

Reuses the academic styling of an existing DLYog paper template (everything up to </style>), so the page matches
the site, and relies on the site's research_papers.json entry for the Google Scholar citation_* tags.

  python3 research/render_dlyog_paper.py ../blog/templates/papers/DistributionTimeVoiceSpecialization.html \
      ../blog/templates/papers/IntelligentRouterMCPToolCalling.html
"""
import html
import re
import sys
from pathlib import Path

SLUG = 'IntelligentRouterMCPToolCalling'
REPORT = 'DLYOG-TR-2026-007'
URL = f'https://www.dlyog.com/papers/{SLUG}'
DESCRIPTION = ('Three ways to turn a small-store owner\'s spoken request into MCP tool calls, compared on the same live store: '
               'a Gemma 4 E2B router choosing one of eleven actions by in-context learning (96.7%), a fine-tuned OPT-350M (90.0%, fastest) '
               'and native tool calling (48.9%), behind one responsible-AI prompt guard (F1 99.67).')
KEYWORDS = ('Model Context Protocol, tool calling, function calling, small language models, in-context learning, intelligent router, '
            'small business, voice assistant, OPT-350M, Gemma, responsible AI, prompt guard')
LINKS = [('Code and data', 'https://github.com/dlyog/StoreYog'), ('Model', 'https://huggingface.co/dlyog/storeyog-opt-350m-mcp-tools'),
         ('Live demo', 'https://storeyog.dlyog.com'), ('Video', 'https://youtu.be/uU1Ww_vpUAU')]


def inline(text):
    """Escape, then apply code, links, bold and italic; bare URLs become links."""
    parts = re.split(r'(`[^`]+`)', text)
    out = []
    for part in parts:
        if part.startswith('`') and part.endswith('`') and len(part) > 1:
            out.append(f'<span class="paper-code">{html.escape(part[1:-1])}</span>')
            continue
        s = html.escape(part, quote=False)
        s = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
        s = re.sub(r'(?<!href=")(?<!">)(https?://[^\s<)]+[^\s<).,;:])', r'<a href="\1" target="_blank" rel="noopener">\1</a>', s)
        s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
        s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', s)
        out.append(s)
    return ''.join(out)


def render_blocks(lines):
    """Paragraphs, single-level lists, tables and fenced code blocks."""
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith('```'):
            j = i + 1
            while j < len(lines) and not lines[j].startswith('```'):
                j += 1
            out.append('<pre class="paper-pre">' + html.escape('\n'.join(lines[i + 1:j])) + '</pre>')
            i = j + 1
            continue
        if line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            head, body = rows[0], [r for r in rows[2:]]
            out.append('<div class="paper-table-wrap"><table class="paper-table"><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head)
                       + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body)
                       + '</tbody></table></div>')
            continue
        if re.match(r'^(- |\d+\. )', line):
            ordered = bool(re.match(r'^\d+\. ', line))
            items = []
            while i < len(lines) and re.match(r'^(- |\d+\. )', lines[i]):
                item = re.sub(r'^(- |\d+\. )', '', lines[i])
                i += 1
                while i < len(lines) and lines[i].startswith('  ') and lines[i].strip():
                    item += ' ' + lines[i].strip()
                    i += 1
                items.append(f'<li>{inline(item)}</li>')
            tag = 'ol' if ordered else 'ul'
            out.append(f'<{tag} class="paper-list">' + ''.join(items) + f'</{tag}>')
            continue
        para = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^(- |\d+\. |\||```|#)', lines[i]):
            para.append(lines[i])
            i += 1
        out.append(f'<p>{inline(" ".join(para))}</p>')
    return '\n'.join(out)


def main(template_path, out_path):
    md = Path(__file__).with_name('paper.md').read_text()
    template = Path(template_path).read_text()
    head_css = template[template.index('<link rel="preconnect"'):template.index('</style>') + len('</style>')]
    title = md.splitlines()[0].lstrip('# ').strip()
    # Split into level-2 sections; drop the title block (author/date lines) and the trailing AI-assistance note.
    sections = re.split(r'^## ', md, flags=re.M)[1:]
    note = ''
    if '\n---\n' in sections[-1]:
        sections[-1], note = sections[-1].split('\n---\n', 1)
    abstract, body, refs = '', [], ''
    n = 0
    for sec in sections:
        name, _, text = sec.partition('\n')
        name = name.strip()
        if name == 'Abstract':
            abstract = render_blocks(text.strip().splitlines())
            continue
        if name == 'References':
            refs = '\n'.join(f'<li id="ref{k}">{inline(r[2:].strip())}</li>' for k, r in enumerate([l for l in text.splitlines() if l.startswith('- ')], 1))
            continue
        appendix = name.startswith('Appendix')
        if not appendix:
            n += 1
        heading = name if appendix else f'{n}. {name}'
        parts = re.split(r'^### ', text, flags=re.M)
        chunk = [f'<div class="paper-section" id="sec-{re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")}">', f'<h2>{html.escape(heading)}</h2>', render_blocks(parts[0].splitlines())]
        for m, sub in enumerate(parts[1:], 1):
            subname, _, subtext = sub.partition('\n')
            label = subname.strip() if appendix else f'{n}.{m} {subname.strip()}'
            chunk += [f'<h3>{html.escape(label)}</h3>', render_blocks(subtext.splitlines())]
        chunk.append('</div>')
        if appendix:
            body.append(('APPENDIX', '\n'.join(chunk)))
        else:
            body.append(('', '\n'.join(chunk)))
    main_body = '\n'.join(c for k, c in body if k != 'APPENDIX')
    appendix_body = '\n'.join(c for k, c in body if k == 'APPENDIX')
    links = ' &nbsp;·&nbsp; '.join(f'{label}: <a href="{u}" target="_blank" rel="noopener" style="color:#000;">{html.escape(u.split("//", 1)[1])}</a>' for label, u in LINKS)
    t = html.escape(title)
    extra_css = '''
  <style>
  /* Tables, code and lists used by this paper. */
  .paper-table-wrap{overflow-x:auto;margin:12px 0}.paper-table{border-collapse:collapse;width:100%;font-size:.86rem}
  .paper-table th,.paper-table td{border-top:1px solid #000;border-bottom:1px solid #000;padding:5px 8px;text-align:left;vertical-align:top}
  .paper-table th{font-weight:700}.paper-pre{white-space:pre-wrap;word-break:break-word;text-align:left;box-sizing:border-box;max-width:100%;font-size:.74rem;line-height:1.45;border:1px solid #000;padding:10px 12px;background:#fff;overflow-x:auto}
  .paper-doc a{overflow-wrap:anywhere}.paper-appendix{margin-top:24px}.paper-appendix h2{font-family:'Space Grotesk',Helvetica,Arial,sans-serif}
  .paper-list{padding-left:22px}.paper-list li{margin:5px 0}.paper-code{font-family:Menlo,Consolas,monospace;font-size:.86em}
  .paper-refs li{margin:6px 0;font-size:.86rem;line-height:1.5}
  </style>'''
    page = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{t}</title>
  {{% include 'partials/scholar_meta.html' %}}
  <!-- Generated from StoreYog research/paper.md by research/render_dlyog_paper.py. Canonical and social tags mirror
       this paper's entry in research_papers.json. -->
  <link rel="canonical" href="{URL}">
  <meta name="description" content="{html.escape(DESCRIPTION)}">
  <meta name="keywords" content="{html.escape(KEYWORDS)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="DLYog Lab Research Services LLC">
  <meta property="og:title" content="{t}">
  <meta property="og:url" content="{URL}">
  <meta property="og:description" content="{html.escape(DESCRIPTION)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="{t}">
  <meta name="twitter:description" content="{html.escape(DESCRIPTION)}">
  {head_css}{extra_css}
</head>
<body>
<div class="paper-wrap">

  <div class="paper-toolbar">
    <span><a href="/research">← Back to Research</a></span>
    <div class="paper-toolbar-actions">
      <button class="paper-btn" id="paperBibtexBtn" title="Copy BibTeX citation">BibTeX</button>
      <button class="paper-btn paper-btn-primary" id="paperPrintBtn" title="Print / Save as PDF" onclick="window.print()">Print / PDF</button>
    </div>
  </div>

  <div class="paper-doc">
    <div style="text-align:center;"><span class="preprint-tag">Preprint · Not Peer Reviewed</span></div>
    <div class="paper-title">{t}</div>
    <div class="paper-authors">Tarun Kumar Chawdhury<sup>1,*</sup></div>
    <div class="paper-affiliations"><sup>1</sup> DLYog Lab Research Services LLC</div>
    <div class="paper-date">
      October 2026 &nbsp;·&nbsp; {REPORT}
      <br><span style="font-size:0.78rem;">{links}</span>
    </div>

    <hr class="paper-divider">
    <div class="paper-abstract-block">
      <div class="abstract-title">Abstract</div>
      {abstract}
      <p class="paper-keywords"><strong>Keywords —</strong> {html.escape(KEYWORDS)}</p>
    </div>
    <hr class="paper-divider">

    <div class="paper-body">
{main_body}
      <div class="paper-section" id="sec-references">
        <h2>References</h2>
        <ol class="paper-refs">
{refs}
        </ol>
      </div>
    </div>
    <!-- Appendix tables are wide, so the appendix sits below the two-column body at full width. -->
    <div class="paper-appendix">
{appendix_body}
    </div>

    <hr class="paper-divider" style="margin-top:28px;">
    <div style="font-size:0.76rem;color:#555;text-align:center;font-family:Georgia,serif;line-height:1.7;">
      StoreYog source code is released under Apache-2.0 &nbsp;·&nbsp; The StoreYog OPT-350M model is released for non-commercial research use under Meta's OPT-175B License Agreement.
      <br><em>{inline(note.strip().strip('*'))}</em>
      <br><em>Preprint, not peer reviewed. All store data is synthetic. Alexa, Echo and Amazon are trademarks of Amazon.com, Inc. or its affiliates; Gemma is a trademark of Google LLC; OPT is a model released by Meta Platforms, Inc. Names are used for reference only; this work is not affiliated with or endorsed by any of these organizations or by any employer.</em>
    </div>
  </div>
</div>
<script>
document.getElementById('paperBibtexBtn').addEventListener('click', function () {{
  var bib = '@techreport{{chawdhury2026router,\\n' +
    '  title       = {{{title}}},\\n' +
    '  author      = {{Chawdhury, Tarun Kumar}},\\n' +
    '  institution = {{DLYog Lab Research Services LLC}},\\n' +
    '  number      = {{{REPORT}}},\\n' +
    '  year        = {{2026}},\\n' +
    '  month       = {{10}},\\n' +
    '  url         = {{{URL}}}\\n}}';
  navigator.clipboard.writeText(bib).then(function () {{
    var b = document.getElementById('paperBibtexBtn');
    var t = b.textContent; b.textContent = 'Copied'; setTimeout(function(){{ b.textContent = t; }}, 1400);
  }});
}});
</script>
</body>
</html>
'''
    Path(out_path).write_text(page)
    print(f'wrote {out_path}: {len(page)} bytes, {n} numbered sections')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
