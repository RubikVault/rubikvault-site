#!/usr/bin/env node
/**
 * RubikVault — Daily Learning Report PDF + Email
 *
 * Generates a 1-page A4 PDF from the latest learning report
 * and emails it to hello@rubikvault.com via Resend API.
 *
 * Run:   node scripts/learning/email-pdf-report.mjs [--date=YYYY-MM-DD] [--no-email]
 * Env:   RESEND_API_KEY  (required for email delivery)
 */

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'mirrors/learning/reports');
const PDF_DIR = path.join(ROOT, 'mirrors/learning/pdfs');
const TO_EMAIL = 'hello@rubikvault.com';

// ─── Helpers ────────────────────────────────────────────────────────────────
function isoDate(d) { return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); }

function readJson(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { return null; }
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function pct(v) { return v != null ? `${(v * 100).toFixed(1)}%` : '—'; }
function num(v) { return v != null ? v.toFixed(4) : '—'; }

function trendText(t) {
    if (t === 'improving') return '↑ Besser';
    if (t === 'declining') return '↓ Schlechter';
    if (t === 'stable') return '→ Stabil';
    return '— Keine Daten';
}

function trendColor(t) {
    if (t === 'improving') return [34, 139, 34];   // green
    if (t === 'declining') return [220, 20, 60];    // red
    if (t === 'stable') return [218, 165, 32];      // goldenrod
    return [120, 120, 120];                          // gray
}

// ─── Self-Critical Analysis ─────────────────────────────────────────────────
function generateSelfCriticism(feature, metrics) {
    const name = feature.name;
    const predsToday = feature.predictions_today ?? feature.rankings_today ?? 0;
    const acc7d = metrics.accuracy_7d;
    const brier7d = metrics.brier_7d;
    const hitRate7d = metrics.hit_rate_7d;
    const trendAcc = metrics.trend_accuracy;

    // No data yet
    if (!acc7d && !hitRate7d && feature.stability == null) {
        if (predsToday === 0) {
            return `Keine Predictions extrahiert. Ursache: Datenpipeline hat heute keine Daten erzeugt. → Prüfen ob die Pipeline (Workflow/Cron) aktiv ist.`;
        }
        return `${predsToday} Predictions geloggt. Outcomes werden nach ${feature.type === 'ranking_stability' ? '1' : feature.type === 'price_direction_probability' ? '1' : '5'} Trading-Tag(en) aufgelöst. Erste Metriken erscheinen dann.`;
    }

    const lines = [];

    // Accuracy analysis
    if (acc7d != null) {
        if (acc7d < 0.50) {
            lines.push(`Accuracy ${pct(acc7d)} unter 50% — Modell ist schlechter als Münzwurf. Logik der Feature-Gewichtung/Schwellenwerte muss überarbeitet werden.`);
        } else if (acc7d < 0.55) {
            lines.push(`Accuracy ${pct(acc7d)} knapp über Baseline. Verbesserungspotenzial bei Feature-Selektion und Calibration.`);
        } else if (acc7d >= 0.60) {
            lines.push(`Accuracy ${pct(acc7d)} — Gute Performance. Feature-Kombination funktioniert.`);
        }
    }

    // Brier analysis
    if (brier7d != null) {
        if (brier7d > 0.25) {
            lines.push(`Brier Score ${num(brier7d)} zu hoch — Wahrscheinlichkeiten sind schlecht kalibriert. → Isotonische Calibration oder Platt Scaling anwenden.`);
        } else if (brier7d < 0.20) {
            lines.push(`Brier Score ${num(brier7d)} — Gute Calibration.`);
        }
    }

    // Hit rate analysis (scientific)
    if (hitRate7d != null && feature.type === 'setup_trigger_breakout') {
        if (hitRate7d < 0.30) {
            lines.push(`Hit Rate ${pct(hitRate7d)} sehr niedrig. Setup/Trigger-Schwellen sind zu permissiv oder Breakout-Threshold (2%) zu hoch. → Trigger-Logik verschärfen.`);
        } else if (hitRate7d >= 0.40) {
            lines.push(`Hit Rate ${pct(hitRate7d)} — Setup/Trigger-Logik filtert effektiv.`);
        }
    }

    // Trend analysis
    if (trendAcc === 'declining') {
        lines.push(`WARNUNG: Accuracy-Trend fallend. Mögliche Ursachen: Marktregime-Wechsel, Feature-Drift, oder Überanpassung an historische Muster. → Feature-Drift-Check durchführen.`);
    } else if (trendAcc === 'improving') {
        lines.push(`Positiv: Trend zeigt Verbesserung. Calibrationsdaten akkumulieren sich.`);
    }

    // Prediction count
    if (predsToday > 0) {
        lines.push(`${predsToday} Predictions heute geloggt.`);
    }

    return lines.length ? lines.join(' ') : `Daten werden gesammelt. Noch keine ausreichende Basis für Analyse.`;
}

// ─── PDF Generation ─────────────────────────────────────────────────────────
function generatePDF(report, outputPath) {
    return new Promise((resolve, reject) => {
        ensureDir(path.dirname(outputPath));
        const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        const W = doc.page.width - 80;
        const brandColor = [41, 98, 255];

        // ─── Header ─────────────────────────────────────────────────────
        doc.rect(0, 0, doc.page.width, 70).fill(`rgb(${brandColor.join(',')})`);
        doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
            .text('RUBIKVAULT — DAILY LEARNING REPORT', 40, 20);
        doc.fontSize(12).font('Helvetica')
            .text(formatDate(report.date), 40, 46);
        doc.fillColor('black');
        doc.y = 85;

        // ─── Overall Status ─────────────────────────────────────────────
        doc.fontSize(12).font('Helvetica-Bold').text('GESAMTSTATUS', 40, doc.y);
        doc.fontSize(11).font('Helvetica')
            .text(report.summary.overall_status, 40, doc.y + 2);
        doc.fontSize(10)
            .text(`Vorhersagen heute: ${report.summary.total_predictions_today}`, 40, doc.y + 2);
        doc.y += 10;

        // ─── Separator ──────────────────────────────────────────────────
        drawSeparator(doc, brandColor);

        // ─── Feature Sections ───────────────────────────────────────────
        const features = report.features;
        const featureOrder = ['forecast', 'scientific', 'elliott', 'stock_analyzer'];

        for (const key of featureOrder) {
            const feat = features[key];
            if (!feat) continue;
            drawFeatureSection(doc, key, feat, W, brandColor);
        }

        // ─── Self-Critical Analysis ─────────────────────────────────────
        drawSeparator(doc, brandColor);
        doc.fontSize(12).font('Helvetica-Bold')
            .fillColor(`rgb(${brandColor.join(',')})`)
            .text('SELBSTKRITISCHE ANALYSE', 40, doc.y);
        doc.fillColor('black');
        doc.y += 4;

        for (const key of featureOrder) {
            const feat = features[key];
            if (!feat) continue;
            const criticism = generateSelfCriticism(feat, feat);
            doc.fontSize(8.5).font('Helvetica-Bold')
                .text(`${feat.name}:`, 40, doc.y, { continued: true });
            doc.font('Helvetica')
                .text(` ${criticism}`, { width: W });
            doc.y += 3;
        }

        // ─── Footer ─────────────────────────────────────────────────────
        const pageH = doc.page.height;
        doc.fontSize(7).fillColor('#888')
            .text(
                `Generiert: ${report.generated_at} | Schema: ${report.schema} | RubikVault Learning System`,
                40, pageH - 30, { width: W, align: 'center' }
            );

        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', reject);
    });
}

function drawSeparator(doc, color) {
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y)
        .strokeColor(`rgb(${color.join(',')})`).lineWidth(0.5).stroke();
    doc.y += 8;
}

function drawFeatureSection(doc, key, feat, W, brandColor) {
    const isStock = key === 'stock_analyzer';

    // Feature name
    doc.fontSize(11).font('Helvetica-Bold')
        .fillColor(`rgb(${brandColor.join(',')})`)
        .text(feat.name, 40, doc.y);
    doc.fillColor('black');

    // Metrics table
    const metrics = [];
    if (!isStock) {
        if (feat.accuracy_7d != null || feat.accuracy_all != null) {
            metrics.push(['Accuracy (7d)', pct(feat.accuracy_7d), trendText(feat.trend_accuracy), feat.trend_accuracy]);
            metrics.push(['Accuracy (30d)', pct(feat.accuracy_all), '', '']);
        }
        if (feat.brier_7d != null) {
            metrics.push(['Brier Score (7d)', num(feat.brier_7d), trendText(feat.trend_brier), feat.trend_brier]);
        }
        if (feat.hit_rate_7d != null) {
            metrics.push(['Hit Rate (7d)', pct(feat.hit_rate_7d), '', '']);
        }
        const count = feat.predictions_today ?? 0;
        metrics.push(['Predictions heute', String(count), '', '']);
    } else {
        if (feat.stability != null) {
            metrics.push(['Ranking-Stabilität', pct(feat.stability), '', '']);
            metrics.push(['Churn (Wechsel)', String(feat.churn ?? '—'), '', '']);
        }
        metrics.push(['Rankings heute', String(feat.rankings_today ?? 0), '', '']);
    }

    if (metrics.length === 0) {
        doc.fontSize(9).font('Helvetica').text('  Noch keine Daten', 40, doc.y);
    }

    for (const [label, value, tText, tKey] of metrics) {
        doc.fontSize(9).font('Helvetica')
            .text(`  ${label}:`, 55, doc.y, { continued: true, width: 140 });
        doc.font('Helvetica-Bold').text(`  ${value}`, { continued: !!tText, width: 80 });
        if (tText) {
            const [r, g, b] = trendColor(tKey);
            doc.font('Helvetica').fillColor(`rgb(${r},${g},${b})`).text(`  ${tText}`);
            doc.fillColor('black');
        }
    }

    doc.y += 6;
}

function formatDate(dateStr) {
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d)}. ${months[parseInt(m) - 1]} ${y}`;
}

// ─── Email via Resend API ───────────────────────────────────────────────────
async function sendEmail(pdfPath, report) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.log('[email] RESEND_API_KEY not set — skipping email. PDF saved locally.');
        return false;
    }

    const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
    const dateFormatted = formatDate(report.date);

    const htmlBody = buildHtmlBody(report);

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: 'RubikVault Learning <onboarding@resend.dev>',
            to: [TO_EMAIL],
            subject: `Learning Report — ${dateFormatted}`,
            html: htmlBody,
            attachments: [{
                filename: `learning-report-${report.date}.pdf`,
                content: pdfBase64,
            }]
        })
    });

    if (res.ok) {
        console.log(`[email] Report sent to ${TO_EMAIL} ✅`);
        return true;
    } else {
        const body = await res.text();
        console.error(`[email] Send failed (${res.status}): ${body}`);
        return false;
    }
}

function buildHtmlBody(report) {
    const statusColor = report.summary.overall_status.includes('BESSER') ? '#228B22' :
        report.summary.overall_status.includes('SCHLECHTER') ? '#DC143C' : '#666';

    const featureRows = Object.entries(report.features).map(([key, feat]) => {
        const label = feat.name;
        const acc = feat.accuracy_7d != null ? `${(feat.accuracy_7d * 100).toFixed(1)}%` : '—';
        const trendAcc = feat.trend_accuracy || '—';
        const count = feat.predictions_today ?? feat.rankings_today ?? 0;
        return `<tr>
      <td style="padding:6px 10px;font-weight:600">${label}</td>
      <td style="padding:6px 10px;text-align:center">${acc}</td>
      <td style="padding:6px 10px;text-align:center">${trendText(trendAcc)}</td>
      <td style="padding:6px 10px;text-align:center">${count}</td>
    </tr>`;
    }).join('');

    return `
<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
  <div style="background:#2962FF;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
    <h2 style="margin:0;font-size:18px">RUBIKVAULT — DAILY LEARNING REPORT</h2>
    <p style="margin:4px 0 0;opacity:0.9">${formatDate(report.date)}</p>
  </div>
  <div style="padding:16px 20px;border:1px solid #e0e0e0;border-top:0">
    <p style="margin:0 0 12px"><strong>Status:</strong> <span style="color:${statusColor}">${report.summary.overall_status}</span></p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#f5f5f5">
        <th style="padding:8px 10px;text-align:left">Feature</th>
        <th style="padding:8px 10px;text-align:center">Accuracy (7d)</th>
        <th style="padding:8px 10px;text-align:center">Trend</th>
        <th style="padding:8px 10px;text-align:center">Heute</th>
      </tr>
      ${featureRows}
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#888">PDF-Report im Anhang mit detaillierter selbstkritischer Analyse.</p>
  </div>
  <div style="padding:8px 20px;font-size:11px;color:#aaa;text-align:center">
    RubikVault Learning System — Automatisch generiert
  </div>
</body></html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const dateArg = args.find(a => a.startsWith('--date='));
    const noEmail = args.includes('--no-email');
    const date = dateArg ? dateArg.split('=')[1] : isoDate(new Date());

    // Load report
    const latestPath = path.join(REPORT_DIR, 'latest.json');
    const datePath = path.join(REPORT_DIR, `${date}.json`);
    const report = readJson(datePath) || readJson(latestPath);

    if (!report) {
        console.error(`[pdf] No report found for ${date}. Run the learning cycle first:`);
        console.error('  node scripts/learning/run-daily-learning-cycle.mjs');
        process.exit(1);
    }

    // Generate PDF
    const pdfPath = path.join(PDF_DIR, `learning-report-${report.date}.pdf`);
    console.log(`[pdf] Generating PDF for ${report.date}...`);
    await generatePDF(report, pdfPath);
    console.log(`[pdf] PDF saved: ${pdfPath}`);

    // Copy to persistent latest
    const latestPdf = path.join(PDF_DIR, 'learning-report-latest.pdf');
    fs.copyFileSync(pdfPath, latestPdf);

    // Send email
    if (!noEmail) {
        await sendEmail(pdfPath, report);
    } else {
        console.log('[email] Skipped (--no-email flag)');
    }
}

main().catch(err => {
    console.error('[pdf-email] FATAL:', err);
    process.exit(1);
});
