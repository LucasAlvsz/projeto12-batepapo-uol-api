import express from "express"
import cors from "cors"
import { MongoClient } from "mongodb"
import dayjs from "dayjs"

// MAGIC NUMBERS
const UPDATEPARTICIPANTSTIME = 10000
const PORT = 5000

const mongoClient = new MongoClient("mongodb://localhost:27017")
let db
mongoClient.connect(() => (db = mongoClient.db("bate_papo_uol")))
let time
const getTime = () => (time = dayjs().format("HH:mm:ss"))

const app = express()
app.use(cors())
app.use(express.json())

app.post("/participants", async (req, res) => {
	// validaçoes aqui
	console.log("/participantes POST-request")
	const { name } = req.body
	time = getTime()
	try {
		await mongoClient.connect()
		const user = await db.collection("participants").findOne({ name })
		if (user) return res.sendStatus(409) // o ususario ja exist
		await db
			.collection("participants")
			.insertOne({ name: name, lastStatus: Date.now() })

		await db.collection("messages").insertOne({
			from: name,
			to: "Todos",
			text: "entra na sala...",
			type: "status",
			time,
		})
		res.sendStatus(201) // criado
	} catch (error) {
		console.log(error)
		res.sendStatus(500) // erro interno
	} finally {
		mongoClient.close()
	}
})

app.listen(PORT, () => {
	console.log(`Server started on port ${PORT}`)
})
