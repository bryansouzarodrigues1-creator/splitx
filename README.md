# SplitX

Ferramenta privada e local-first para trabalhar com arquivos grandes diretamente no navegador.

## Recursos

- Divisão binária de arquivos grandes em partes numeradas.
- Reconstrução das partes sem alterar os bytes originais.
- União e reordenação de PDFs.
- Conversão de imagens JPG, PNG e WebP para PDF.
- Conversão de páginas PDF para imagens JPG em ZIP.
- Conversão experimental de DOCX para PDF.

Os arquivos são processados no próprio dispositivo; o SplitX não precisa enviá-los para um servidor.

## Preparação local

```bash
npm install
npm run build
```

Depois, sirva a pasta `dist` com um servidor HTTP local. Exemplo:

```bash
npx serve dist
```

As bibliotecas grandes ficam fora do Git e são copiadas automaticamente de `node_modules` para `dist/vendor` durante o build.

## Site

<https://splitx-fast.bryansouzarodrigues0.chatgpt.site>
