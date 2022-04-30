import express from "express"
import cors from "cors"
import { MongoClient } from "mongodb"
import dayjs from "dayjs"
import dotenv from "dotenv"

// MAGIC NUMBERS
const UPDATEPARTICIPANTSTIME = 10000
const PORT = 5000

dotenv.config()
const mongoClient = new MongoClient(process.env.DATABASE_URL)
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

app.get("/participants", async (req, res) => {
	try {
		const participants = await db
			.collection("participants")
			.find({})
			.toArray()
		res.status(200).send(participants)
	} catch (error) {
		console.log(error)
		res.sendStatus(500) // erro interno
	} finally {
		mongoClient.close()
	}
})

app.post("/messages", async (req, res) => {
	// validações
	const { to, text, type } = req.body
	time = getTime()
	const { user } = req.headers
	try {
		await db
			.collection("messages")
			.insertOne({ from: user, to, text, type, time })
		res.sendStatus(201)
	} catch (error) {
		console.log(error)
		res.sendStatus(500) // erro interno
	} finally {
		mongoClient.close()
	}
})

app.get("/messages", async (req, res) => {
	const limit = parseInt(req.query.limit)
	const { user } = req.headers
	const options = {
		limit,
	}
	try {
		const test = await db.collection("messages").find({}).toArray()
		//console.log(test)
		const messages = await db
			.collection("messages")
			.find({ $or: [{ to: "Todos" }, { to: user }] }, options)
			.toArray()
		res.status(200).send(messages)
	} catch (error) {
		console.log(error)
		res.send(500, error) // erro interno
	} finally {
		mongoClient.close()
	}
})

app.post("/status", async (req, res) => {
	const { user } = req.headers
	const lastStatus = Date.now()
	try {
		const isConnected = await db
			.collection("participants")
			.findOneAndUpdate({ name: user }, { $set: { lastStatus } })
		isConnected.value ? res.sendStatus(200) : res.sendStatus(404)
	} catch (error) {
		console.log(error)
		res.send(500, error)
	} finally {
		mongoClient.close()
	}
})

setInterval(async () => {
	const minTime = Date.now() - UPDATEPARTICIPANTSTIME
	try {
		await db
			.collection("participants")
			.deleteMany({ lastStatus: { $lt: minTime } })
	} catch (error) {
		console.log(error)
	} finally {
		mongoClient.close()
	}
}, UPDATEPARTICIPANTSTIME)

app.listen(PORT, () => {
	console.log(`Server started on port ${PORT}`)
})
