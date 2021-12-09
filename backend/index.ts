import express from 'express';
import * as PREC from 'prec';
import * as n3 from 'n3';

async function main() {
  // Setup app
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.disable('x-powered-by');

  // Setup API

  app.post('/rest/transform_graph', (req, res) => {
    try {
      const rdfgraph = PREC.cypherJsontoRDF(req.body);

      const serializer = new n3.Writer();
      serializer.addQuads([...rdfgraph]);

      serializer.end((err, result) => {
        if (err) {
          console.log(err);
          res.status(400).json({ message: "invalid request" });
        } else {
          res.json({ quads: result });
        }
      })
    } catch (e) {
      console.log(e);
      res.status(400).json({ message: "invalid request" });
    }
  });

  app.listen(12344, () => {
    console.log("PREC Demo Web Server is listening on http://localhost:12344");
  });
}


main();
