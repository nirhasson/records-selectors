import { fetchRandomAlbum, fetchCustomAlbum } from '../discogs.js';

export default async function handler(req, res) {
  console.log("📡 בקשה ל-API /album התקבלה");

  if (req.method === 'GET') {
    try {
      console.log("🔄 Fetching album...");

      // ניסיון להביא אלבום מותאם אישית
      const customAlbum = await fetchCustomAlbum();

      // יצירת מספר רנדומלי בין 1 ל-100
      let percent = Math.ceil(Math.random() * 100);
      console.log(`🔢 Percent chosen: ${percent}`);

      // קביעת איזה אלבום יישלח
      let album = (percent < 1 && customAlbum) ? customAlbum : await fetchRandomAlbum();

      // בדיקה אם קיים אלבום תקף
      if (!album || !album.title) {
        console.error("🚨 Error in getAlbum: ❌ No album found in both sources.");
        return res.status(500).json({ error: 'No album found' });
      }

      console.log(`🏪 Album selected from store: ${album.store || 'Custom List'}`);
      console.log("✅ Sending album to frontend:", album);
      return res.status(200).json(album);

    } catch (error) {
      console.error("❌ Error in getAlbum:", error);
      return res.status(500).json({ error: 'Failed to fetch album' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`שיטת הבקשה ${req.method} אינה נתמכת`);
  }
}
