#!/usr/bin/env node

import fs from 'node:fs/promises';
import net from 'node:net';
import tls from 'node:tls';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function splitRecipients(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function onceLine(reader) {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      reader.buffer += chunk.toString('utf8');
      if (!/\r?\n/.test(reader.buffer)) return;
      const lines = reader.buffer.split(/\r?\n/);
      reader.buffer = lines.pop() || '';
      resolve(lines.filter(Boolean));
    };
    const onError = (error) => reject(error);
    reader.socket.once('data', onData);
    reader.socket.once('error', onError);
  });
}

async function readResponse(reader) {
  const lines = [];
  while (true) {
    const chunkLines = await onceLine(reader);
    lines.push(...chunkLines);
    if (chunkLines.some((line) => /^\d{3} /.test(line))) break;
  }
  const last = lines[lines.length - 1] || '';
  const code = Number(last.slice(0, 3));
  return { code, lines };
}

async function writeCommand(reader, command, expected = [250]) {
  reader.socket.write(`${command}\r\n`);
  const response = await readResponse(reader);
  if (!expected.includes(response.code)) {
    throw new Error(`SMTP ${command} failed: ${response.lines.join(' | ')}`);
  }
  return response;
}

async function upgradeStartTls(reader, host) {
  reader.socket.removeAllListeners('data');
  const secureSocket = tls.connect({
    socket: reader.socket,
    servername: host,
    rejectUnauthorized: false
  });
  await new Promise((resolve, reject) => {
    secureSocket.once('secureConnect', resolve);
    secureSocket.once('error', reject);
  });
  return { socket: secureSocket, buffer: '' };
}

async function main() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT || 587);
  const secureMode = String(process.env.SMTP_SECURE || 'starttls').toLowerCase();
  const username = process.env.SMTP_USER || '';
  const password = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM || 'nas-monitoring@localhost';
  const to = splitRecipients(argValue('--to') || process.env.EMAIL_TO || '');
  const subject = argValue('--subject') || 'NAS Report';
  const bodyPath = argValue('--body-file');
  const body = bodyPath ? await fs.readFile(bodyPath, 'utf8') : argValue('--body');

  if (!host) throw new Error('SMTP_HOST missing');
  if (!to.length) throw new Error('recipient missing');

  const baseSocket = secureMode === 'implicit'
    ? tls.connect({ host, port, servername: host, rejectUnauthorized: false })
    : net.connect({ host, port });

  await new Promise((resolve, reject) => {
    baseSocket.once(secureMode === 'implicit' ? 'secureConnect' : 'connect', resolve);
    baseSocket.once('error', reject);
  });

  let reader = { socket: baseSocket, buffer: '' };
  let response = await readResponse(reader);
  if (response.code !== 220) {
    throw new Error(`SMTP greeting failed: ${response.lines.join(' | ')}`);
  }

  response = await writeCommand(reader, 'EHLO nas-monitor', [250]);
  const supportsStartTls = response.lines.some((line) => /STARTTLS/i.test(line));

  if ((secureMode === 'starttls' || secureMode === 'auto') && supportsStartTls) {
    await writeCommand(reader, 'STARTTLS', [220]);
    reader = await upgradeStartTls(reader, host);
    await writeCommand(reader, 'EHLO nas-monitor', [250]);
  }

  if (username && password) {
    await writeCommand(reader, 'AUTH LOGIN', [334]);
    await writeCommand(reader, Buffer.from(username).toString('base64'), [334]);
    await writeCommand(reader, Buffer.from(password).toString('base64'), [235]);
  }

  await writeCommand(reader, `MAIL FROM:<${from}>`, [250]);
  for (const recipient of to) {
    await writeCommand(reader, `RCPT TO:<${recipient}>`, [250, 251]);
  }
  await writeCommand(reader, 'DATA', [354]);

  const headers = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    `Date: ${new Date().toUTCString()}`
  ];
  const message = `${headers.join('\r\n')}\r\n\r\n${String(body || '').replace(/\n/g, '\r\n')}\r\n.\r\n`;
  reader.socket.write(message);
  response = await readResponse(reader);
  if (response.code !== 250) {
    throw new Error(`SMTP DATA failed: ${response.lines.join(' | ')}`);
  }

  await writeCommand(reader, 'QUIT', [221]);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
