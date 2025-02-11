const puppeteer = require('puppeteer');

async function scrapeCategory() {
    const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();
    await page.goto('https://www.superflyrecords.com/collections/all', { waitUntil: 'networkidle2' });

    console.log("Page loaded, waiting for selector...");

    // מחכים עד שנראה את כל התמונות של המוצרים בעמוד
    await page.waitForSelector('img[alt]'); // מחכים עד שנראה תמונות עם אלט

    // שליפת כל התמונות והאלט שלהן
    const images = await page.evaluate(() => {
        const data = [];
        const imageElements = document.querySelectorAll('img[alt]');
        imageElements.forEach(img => {
            const altText = img.alt; // שם האלבום והאומן
            const imageUrl = img.src; // כתובת התמונה
            data.push({ altText, imageUrl });
        });
        return data;
    });

    console.log('Found images:', images); // הדפסת התמונות והמידע

    // חזרה על כל התוצאות
    for (let img of images) {
        console.log(`Album: ${img.altText}, Image: ${img.imageUrl}`);
    }

    await browser.close();
}

scrapeCategory();
