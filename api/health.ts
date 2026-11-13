export default function handler(req: any, res: any) {
  res.status(200).json({
    status: 'ok',
    hasServerKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5),
  });
}
