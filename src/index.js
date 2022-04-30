import express from "express"
import cors from "cors"
import { MongoClient } from "mongodb"
import dayjs from "dayjs"
import dotenv from "dotenv"
import joi from "joi"
import { stripHtml } from "string-strip-html"

/*            MAGIC NUMBERS             */
const UPDATEPARTICIPANTSTIME = 10000
const PORT = 5000
/* ------------------------------------ */

dotenv.config()
const mongoClient = new MongoClient(process.env.DATABASE_URL)
let db
const promise = mongoClient.connect()
promise.then(() => (db = mongoClient.db("bate_papo_uol")))
let time
const getTime = () => (time = dayjs().format("HH:mm:ss"))

const validate = (reqId, req) => {
	if (reqId === "POST-/participants") {
		const participantsSchema = joi.object({
			name: joi.string().required(),
		})
		const validation = participantsSchema.validate(req.body, {
			abortEarly: false,
		})

		if (validation.error) return validation.error.details
	} else if (reqId === "POST-/messages") {
		const messagesSchema = joi.object({
			to: joi.string().required(),
			text: joi.string().required(),
			type: joi.string().valid("message", "private_message").required(),
		})
		const validation = messagesSchema.validate(req.body, {
			abortEarly: false,
		})
		if (!req.headers.user)
			validation.error
				? validation.error.details.unshift({
						message: 'Missing headers: "User"',
				  })
				: (validation.error = {
						details: [{ message: 'Missing headers: "User"' }],
				  })

		if (validation.error) return validation.error.details
	} else if (reqId === "GET-/messages") {
		if (!req.headers.user) return [{ message: 'Missing headers: "User"' }]
	} else if (reqId === "POST-/status")
		if (!req.headers.user) return [{ message: 'Missing headers: "User"' }]

	return false
}
const dataSanitize = data => {
	const sanitizedData = { ...data }
	Object.keys(sanitizedData).forEach(
		key =>
			(sanitizedData[key] = stripHtml(sanitizedData[key]).result.trim())
	)
	return sanitizedData
}

const app = express()
app.use(cors())
app.use(express.json())

app.post("/participants", async (req, res) => {
	console.log("/participantes POST-request")
	const validation = validate("POST-/participants", req)
	if (validation) return res.status(422).send(validation.map(e => e.message))
	const { name } = dataSanitize(req.body)
	time = getTime()
	try {
		const participant = await db
			.collection("participants")
			.findOne({ name })
		if (participant) return res.sendStatus(409) // o ususario ja exist
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
		res.status(201).send({ name })
	} catch (error) {
		console.log(error)
		res.sendStatus(500)
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
	}
})

app.post("/messages", async (req, res) => {
	const validation = validate("POST-/messages", req)
	if (validation) return res.status(422).send(validation.map(e => e.message))
	const { to, text, type } = dataSanitize(req.body)
	time = getTime()
	console.log(time)
	const { user } = req.headers
	try {
		await db
			.collection("messages")
			.insertOne({ from: user, to, text, type, time })
		res.sendStatus(201)
	} catch (error) {
		console.log(error)
		res.sendStatus(500) // erro interno
	}
})

app.get("/messages", async (req, res) => {
	const limit = parseInt(req.query.limit)
	const { user } = req.headers
	const options = {
		limit,
		...(limit && { sort: { time: -1 } }),
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
	}
})

app.post("/status", async (req, res) => {
	const validation = validate("POST-/status", req)
	if (validation) return res.status(422).send(validation.map(e => e.message))
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
	}
}, UPDATEPARTICIPANTSTIME)

app.listen(PORT, () => {
	console.log(`Server started on port ${PORT}`)
})
