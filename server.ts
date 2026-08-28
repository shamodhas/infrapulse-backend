// backend/server.ts
import express from "express"
import helmet from "helmet"
import cors from "cors"
import { Client } from "ssh2"

const app = express()
app.use(helmet())
app.use(cors())
app.use(express.json())

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

// Helper function to execute command via SSH on remote server
const executeRemoteSSH = (host: string, username: string, passOrKey: string): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let output = ""

    conn.on("ready", () => {
      conn.exec("docker ps --format '{\"id\":\"{{.ID}}\",\"name\":\"{{.Names}}\",\"status\":\"{{.Status}}\"}'", (err, stream) => {
        if (err) {
          conn.end()
          return reject(err)
        }
        stream.on("data", (data: Buffer) => {
          output += data.toString()
        })
        stream.on("close", (code: number) => {
          conn.end()
          if (code !== 0) {
            return resolve([])
          }
          try {
            const lines = output.trim().split("\n").filter(Boolean)
            const containers = lines.map(line => JSON.parse(line))
            resolve(containers)
          } catch (e) {
            resolve([])
          }
        })
      })
    }).on("error", (err) => {
      reject(err)
    }).connect({
      host: host,
      port: 22,
      username: username,
      password: passOrKey,
      readyTimeout: 10000
    })
  })
}

// Helper function to restart container via SSH
const restartRemoteSSH = (host: string, username: string, passOrKey: string, containerId: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let output = ""

    conn.on("ready", () => {
      conn.exec(`docker restart ${containerId}`, (err, stream) => {
        if (err) {
          conn.end()
          return reject(err)
        }
        stream.on("data", (data: Buffer) => {
          output += data.toString()
        })
        stream.on("close", (code: number) => {
          conn.end()
          if (code !== 0) {
            return reject(new Error("Failed to restart container"))
          }
          resolve({ status: "success", target: containerId, output: output.trim() })
        })
      })
    }).on("error", (err) => {
      reject(err)
    }).connect({
      host: host,
      port: 22,
      username: username,
      password: passOrKey,
      readyTimeout: 10000
    })
  })
}

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() })
})

app.get("/api/containers", clientAuthMiddleware, async (req, res) => {
  try {
    const targetHost = req.headers["x-target-host"] as string
    const sshUser = (req.headers["x-ssh-user"] as string) || "root"
    const sshSecret = req.headers["x-ssh-secret"] as string

    if (!targetHost || !sshSecret) {
      return res.status(400).json({ error: "Target host or SSH credentials missing in headers" })
    }

    const containers = await executeRemoteSSH(targetHost, sshUser, sshSecret)
    res.json({ containers })
  } catch (error: any) {
    res.status(500).json({ error: `SSH Connection Failed: ${error.message}` })
  }
})

app.post("/api/containers/:id/restart", clientAuthMiddleware, async (req, res) => {
  try {
    const containerId = req.params.id
    const targetHost = req.body.host
    const sshUser = req.body.sshUser || "root"
    const sshSecret = req.body.sshSecret

    if (!targetHost || !sshSecret) {
      return res.status(400).json({ error: "Target host or SSH credentials missing in request body" })
    }

    const result = await restartRemoteSSH(targetHost, sshUser, sshSecret, containerId)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: `Failed to restart container: ${error.message}` })
  }
})

app.listen(3000, () => console.log("Backend running on port 3000"))