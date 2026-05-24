const fs = require('fs');
const path = String.raw`c:\Users\Joaquin\Documents\GitHub\TuBarrio\components\BracketTab.tsx`;
let content = fs.readFileSync(path, 'utf8');

// Fix line 203: 3 spaces -> 2 spaces
content = content.replace(
  '   Las llaves de eliminación directa aún no han sido generadas para este torneo.\r\n </p>\r\n</div>\r\n',
  '  Las llaves de eliminación directa aún no han sido generadas para este torneo.\r\n </p>\r\n </div>\r\n'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Done');

// Verify
const lines = fs.readFileSync(path, 'utf8').split('\n');
lines.slice(199, 208).forEach((l, i) => console.log(i+200, JSON.stringify(l)));
