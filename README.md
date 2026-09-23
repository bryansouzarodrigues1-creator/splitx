# SplitX

Divida e junte arquivos grandes ou use as ferramentas de PDF direto no navegador. Os arquivos não são enviados para um servidor.

O PDF Studio permite organizar páginas visualmente, apagar, girar e mudar a ordem, além de unir PDFs, converter imagens, extrair páginas em JPG e transformar documentos DOCX simples.

O site também pode ser instalado e usado offline depois da primeira visita.

## Publicar no Netlify

1. Importe este repositório no Netlify.
2. O Netlify usará automaticamente as configurações de `netlify.toml`.
3. Publique o site.

Configuração já definida:

- Comando: `npm run build`
- Pasta publicada: `dist`
- Node.js: versão 22

Os arquivos `robots.txt` e `sitemap.xml` já estão prontos para o Google.

## Rodar no computador

```bash
npm install
npm run build
npx serve dist
```
