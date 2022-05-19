# SHACLed Turtle

Turtle language support for [Code Mirror 6](https://codemirror.net/6/) that uses
an RDFS + SHACL graph to provide auto completion.


***You can test Shacled Turtle online on this page: https://bruy.at/demo/shacled-turtle/demo.html***

***You can also participate to an evaluation: https://shacled-turtle-eval.bruy.at/***

This repository also provides a basic demonstration of
[PREC](https://github.com/BruJu/PREC) on a web browser.


## Getting started

- `npm install`
- `cd demo`
- `npm run start`
- http://localhost:12345/index.html


## Packages

- [demo](demo) is the folder for the demonstration. It currently contains two
demos:
  - The *index* demo with a code editor. You are able to test the autocompletion
  and modify the schema graph
  - The *prec-demo* demo that provides a GUI for PREC context. This page
  requires the *precdemo-backend* to be started.

- [lang-turtle](lang-turtle) is the basic turtle language support for Code
Mirror. It only provide syntactic coloration

- [shacled-turtle](shacled-turtle) is a Code Mirror extension that provides both
Turtle language support and an autocompletion engine based on a schema graph.

- [precdemo-backend](precdemo-backend) is the backend for the "PREc demonstration"
demo


## License

This work is dual-licensed under the MIT license and the CeCILL-B license by INSA Lyon / Julian Bruyat. You can choose between one of them.

`SPDX-License-Identifier: MIT OR CECILL-B`
