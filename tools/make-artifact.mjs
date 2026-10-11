// Construit dist/artifact.html : la page du build sans enveloppe <html>/<head>/<body>
// (format attendu pour une publication en Artifact), avec la liste des fichiers à joindre.
import fs from 'node:fs';
const html = fs.readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head.split('\n').filter((l) => /<title|<link|<script|<meta name="description"/.test(l)).join('\n');
fs.writeFileSync('dist/artifact.html', `${keep}\n${body.trim()}\n`);
const files = {};
for (const f of fs.readdirSync('dist/assets')) files[`assets/${f}`] = `dist/assets/${f}`;
console.log(JSON.stringify(files));
