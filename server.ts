// backend/server.ts
import express from "express"
import helmet from "helmet"
import axios from "axios"
import cors from "cors"

const app = express()
app.use(helmet())
app.use(cors())
app.use(express.json())

const AGENT_TOKEN =
  process.env.SECURE_TOKEN ||
  "JPayZIfQHEmhaQzpDfhOld73Q7GFrcxdLwalPus88taEJqfTU3aeHO02gAOeayHf"
const AGENT_BASE_URL =
  process.env.AGENT_PUBLIC_URL ||
  process.env.AGENT_BASE_URL ||
  "http://localhost:8000"
const CPU_THRESHOLD = 85.0

const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY

const clientAuthMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const clientToken = req.headers.authorization?.split(" ")[1]
  if (!clientToken)
    return res.status(401).json({ error: "Client Unauthorized" })
  next()
}

const authMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1]
  if (token !== AGENT_TOKEN)
    return res.status(403).json({ error: "Unauthorized Agent" })
  next()
}

const sendAlert = async (message: string) => {
  if (!WHATSAPP_PHONE || !WHATSAPP_API_KEY) return
  const url = `https://api.callmebot.com/whatsapp.php?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(message)}&apikey=${WHATSAPP_API_KEY}`
  await axios.get(url).catch(() => {})
}

app.post("/api/metrics", authMiddleware, async (req, res) => {
  const { system, containers } = req.body

  if (system.cpu > CPU_THRESHOLD) {
    await sendAlert(`⚠️ *CRITICAL:* CPU Usage at ${system.cpu}%`)
  }

  const crashed = containers.filter((c: any) => c.status === "exited")
  if (crashed.length > 0) {
    await sendAlert(
      `🚨 *ALERT:* Containers Down -> ${crashed.map((c: any) => c.name).join(", ")}`
    )
  }

  res.status(200).json({ status: "Logged" })
})

app.get("/api/containers", clientAuthMiddleware, async (req, res) => {
  try {
    const response = await axios.get(`${AGENT_BASE_URL}/containers`, {
      headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
    })
    res.json(response.data)
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch containers from agent" })
  }
})

app.post(
  "/api/containers/:id/restart",
  clientAuthMiddleware,
  async (req, res) => {
    try {
      const containerId = req.params.id
      const response = await axios.post(
        `${AGENT_BASE_URL}/containers/${containerId}/restart`,
        {},
        {
          headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
        }
      )
      res.json(response.data)
    } catch (error) {
      res.status(500).json({ error: "Failed to restart container" })
    }
  }
)

app.listen(3000, () => console.log("Backend running on port 3000"))
