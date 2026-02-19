const puppeteer = require('puppeteer');
const path = require('path');

const files = [
    { html: 'sticker-a7.html',   pdf: 'Room8-Sticker-A7.pdf',  width: '74mm',  height: '105mm' },
    { html: 'flyer-a5.html',     pdf: 'Room8-Flyer-A5.pdf',    width: '148mm', height: '210mm' },
    { html: 'flyer-final.html',  pdf: 'Room8-Flyer-A4.pdf',    width: '210mm', height: '297mm' },
    { html: 'plakat-a3.html',    pdf: 'Room8-Plakat-A3.pdf',   width: '297mm', height: '420mm' },
    { html: 'plakat-a2.html',    pdf: 'Room8-Plakat-A2.pdf',   width: '420mm', height: '594mm' },
    { html: 'plakat-a1.html',    pdf: 'Room8-Plakat-A1.pdf',   width: '594mm', height: '841mm' },
];

const srcDir = path.join(__dirname, 'www');
const outDir = 'C:\\Users\\yusuf\\Desktop\\Room8-Druckdateien';

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    for (const f of files) {
        console.log(`Generating ${f.pdf}...`);
        const page = await browser.newPage();

        const filePath = path.join(srcDir, f.html);
        await page.goto('file:///' + filePath.replace(/\\/g, '/'), {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Wait for QR codes to render
        await page.waitForFunction(() => {
            const qrApple = document.getElementById('qr-apple');
            const qrPlay = document.getElementById('qr-play');
            return qrApple && qrApple.querySelector('canvas,img') &&
                   qrPlay && qrPlay.querySelector('canvas,img');
        }, { timeout: 10000 });

        // Extra wait for fonts
        await new Promise(r => setTimeout(r, 2000));

        await page.pdf({
            path: path.join(outDir, f.pdf),
            width: f.width,
            height: f.height,
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            preferCSSPageSize: false
        });

        console.log(`  -> ${f.pdf} done!`);
        await page.close();
    }

    await browser.close();
    console.log('\nAlle PDFs fertig!');
})();
