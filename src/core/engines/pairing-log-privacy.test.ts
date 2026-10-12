// Modified by NooviCrew. This file was added to the upstream WAHA work (Apache License, Version 2.0, section 4(b)).
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// Pairing logs must not carry the phone number nor the pairing or passkey
// confirmation code. The response body still returns the code to the caller;
// only log lines are checked here.
const ENGINES = [
  'noweb/session.noweb.core.ts',
  'gows/session.gows.core.ts',
  'webjs/session.webjs.core.ts',
  'wpp/session.wpp.core.ts',
];

const LOG_METHODS = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'log',
]);

const SENSITIVE = new Set(['phoneNumber', 'phone', 'code', 'codeRepr']);

interface LogCall {
  line: number;
  text: string;
  sensitive: string[];
}

function parse(file: string): ts.SourceFile {
  const full = path.join(__dirname, file);
  return ts.createSourceFile(
    full,
    fs.readFileSync(full, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

function isLoggerCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return false;
  }
  if (!LOG_METHODS.has(callee.name.text)) {
    return false;
  }
  return /logger$/i.test(callee.expression.getText());
}

function sensitiveRefs(node: ts.Node): string[] {
  const found: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isIdentifier(child) && SENSITIVE.has(child.text)) {
      found.push(child.text);
    }
    if (ts.isStringLiteralLike(child) && /\d{8,}/.test(child.text)) {
      found.push(child.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function logCalls(root: ts.Node, source: ts.SourceFile): LogCall[] {
  const calls: LogCall[] = [];
  const visit = (node: ts.Node) => {
    if (isLoggerCall(node)) {
      const refs = node.arguments.flatMap((arg) => sensitiveRefs(arg));
      calls.push({
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        text: node.getText(),
        sensitive: refs,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return calls;
}

function requestCode(source: ts.SourceFile): ts.MethodDeclaration {
  let found: ts.MethodDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isMethodDeclaration(node) &&
      node.name.getText() === 'requestCode' &&
      node.body
    ) {
      found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found) {
    throw new Error(`requestCode not found in ${source.fileName}`);
  }
  return found;
}

describe('pairing log privacy', () => {
  it('detects a leaking log call (self-check)', () => {
    const sample = ts.createSourceFile(
      'sample.ts',
      [
        'class S {',
        '  requestCode(phoneNumber: string) {',
        "    this.logger.info(`Requesting pairing code for '${phoneNumber}'...`);",
        '    const code = "ABCDEFGH";',
        '    this.logger.info({ code: code }, "Your code");',
        "    this.logger.debug('Pairing code generated');",
        '  }',
        '}',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
    );
    const calls = logCalls(requestCode(sample), sample);
    expect(calls.map((call) => call.sensitive.length > 0)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it.each(ENGINES)('%s requestCode logs no phone or code', (file) => {
    const source = parse(file);
    const method = requestCode(source);
    const leaks = logCalls(method, source).filter(
      (call) => call.sensitive.length > 0,
    );
    expect(leaks).toEqual([]);
  });

  it.each(ENGINES)('%s has no log call carrying a code or phone', (file) => {
    const source = parse(file);
    const leaks = logCalls(source, source).filter(
      (call) => call.sensitive.length > 0,
    );
    expect(leaks).toEqual([]);
  });

  it('still returns the pairing code to the caller', () => {
    for (const file of ['noweb', 'gows', 'webjs', 'wpp']) {
      const name = ENGINES.find((item) => item.startsWith(`${file}/`));
      const body = requestCode(parse(name)).body.getText();
      expect(body).toMatch(/return \{ code: /);
    }
  });
});
