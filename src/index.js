import express from "express"
import cors from "cors"
import { MongoClient, ObjectId } from "mongodb"
import dayjs from "dayjs"
import dotenv from "dotenv"
import joi from "joi"
import { stripHtml } from "string-strip-html"

/*            MAGIC NUMBERS             */
const STATUSUPDATEINTERVAL = 15000
const MAXTIMEWITHOUTSTATUSUPDATE = 10000
const PORT = 5000
/* ------------------------------------ */

dotenv.config()
const mongoClient = new MongoClient(process.env.DATABASE_URL)
let db
const promise = mongoClient.connect()
promise.then(() => (db = mongoClient.db("bate_papo_uol")))
let time
const getTime = () => (time = dayjs().format("HH:mm:ss"))

const validateObjectId = id => {
	if (ObjectId.isValid(id)) if (String(new ObjectId(id)) === id) return true
	return false
}
const validate = (reqId, req) => {
	if (reqId === "POST-/participants") {
		const participantsSchema = joi.object({
			name: joi.string().required(),
		})
		const validation = participantsSchema.validate(req.body, {
			abortEarly: false,
		})

		if (validation.error) return validation.error.details
	} else if (reqId === "POST-/messages" || reqId === "PUT-/messages") {
		if (reqId === "PUT-/messages")
			if (!validateObjectId(req.params.messageId))
				return [{ message: "Invalid message id" }]
		if (!req.headers.user) return [{ message: 'Missing headers: "User"' }]
		const messagesSchema = joi.object({
			to: joi.string().required(),
			text: joi.string().required(),
			type: joi.string().valid("message", "private_message").required(),
		})
		const validation = messagesSchema.validate(req.body, {
			abortEarly: false,
		})

		if (validation.error) return validation.error.details
	} else if (reqId === "GET-/messages") {
		if (!req.headers.user) return [{ message: 'Missing headers: "User"' }]
		const limitSchema = joi.object({
			limit: joi.number().integer().min(1),
		})
		const validation = limitSchema.validate(req.query, {
			abortEarly: false,
		})
		if (validation.error) return validation.error.details
	} else if (reqId === "POST-/status") {
		if (!req.headers.user) return [{ message: 'Missing headers: "User"' }]
	} else if (reqId === "DELETE-/messages") {
		if (!validateObjectId(req.params.messageId))
			return [{ message: "Invalid message id" }]
		if (!req.headers.user) return [{ message: 'Missing headers: "User"' }]
	} else if (reqId === "POST-/status") {
		if (!req.headers.user) return [{ message: 'Missing headers: "User"' }]
	}
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
	const validation = validate("POST-/participants", req)
	if (validation) return res.status(422).send(validation.map(e => e.message))
	const { name } = dataSanitize(req.body)
	time = getTime()
	try {
		const participant = await db
			.collection("participants")
			.findOne({ name })
		if (participant) return res.sendStatus(409)
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
}) // OK

app.get("/participants", async (req, res) => {
	try {
		const participants = await db
			.collection("participants")
			.find({})
			.toArray()
		res.status(200).send(participants) // faz sentido retornar todos os campos?
	} catch (error) {
		console.log(error)
		res.sendStatus(500)
	}
}) // Check this

app.post("/messages", async (req, res) => {
	const validation = validate("POST-/messages", req)
	if (validation) return res.status(422).send(validation.map(e => e.message))
	const { to, text, type } = dataSanitize(req.body)
	time = getTime()
	const { user } = req.headers
	try {
		const isConnected = await db
			.collection("participants")
			.findOne({ name: user })
		if (!isConnected) return res.status(422).send("User not found")
		await db
			.collection("messages")
			.insertOne({ from: user, to, text, type, time })
		res.sendStatus(201) // return message id?
	} catch (error) {
		console.log(error)
		res.sendStatus(500)
	}
}) // Check this

app.get("/messages", async (req, res) => {
	const validation = validate("GET-/messages", req)
	if (validation) return res.status(422).send(validation.map(e => e.message))
	const limit = parseInt(req.query.limit)
	const { user } = req.headers
	const options = {
		...(limit && { limit }),
		...(limit && { sort: { $natural: -1 } }),
	}
	try {
		const messages = await db
			.collection("messages")
			.find(
				{ $or: [{ to: "Todos" }, { to: user }, { from: user }] },
				options
			)
			.toArray()
		res.status(200).send(messages.reverse()) // return id?
	} catch (error) {
		console.log(error)
		res.send(500, error)
	}
}) // Check this

app.delete("/messages/:messageId", async (req, res) => {
	const validation = validate("DELETE-/messages", req)
	if (validation) return res.status(422).send(validation.map(e => e.message))
	const { messageId } = req.params
	const { user } = req.headers
	try {
		const message = await db
			.collection("messages")
			.findOneAndDelete({ _id: new ObjectId(messageId), from: user })
		if (!message.value) {
			const validation = await db
				.collection("messages")
				.findOne({ _id: new ObjectId(messageId) })
			if (validation) return res.sendStatus(401)
			return res.sendStatus(404)
		}
		res.sendStatus(200)
	} catch (error) {
		console.log(error)
		res.sendStatus(500)
	}
}) // Ok

app.put("/messages/:messageId", async (req, res) => {
	const { messageId } = req.params
	const { user } = req.headers
	const validation = validate("PUT-/messages", req)
	if (validation) return res.status(422).send(validation.map(e => e.message))
	const { text } = dataSanitize(req.body)
	try {
		const isConnected = await db
			.collection("participants")
			.findOne({ name: user })
		if (!isConnected) return res.status(422).send("User not found")
		const message = await db
			.collection("messages")
			.findOneAndUpdate(
				{ _id: new ObjectId(messageId), from: user },
				{ $set: { text } }
			)
		if (!message.value) {
			const validation = await db
				.collection("messages")
				.findOne({ _id: new ObjectId(messageId) })
			if (validation) return res.sendStatus(401)
			return res.sendStatus(404)
		}
		res.sendStatus(200)
	} catch (error) {
		console.log(error)
		res.sendStatus(500)
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
		res.sendStatus(500)
	}
})

setInterval(async () => {
	const minTime = Date.now() - MAXTIMEWITHOUTSTATUSUPDATE
	time = getTime()
	try {
		const deletedParticipants = await db
			.collection("participants")
			.find({ lastStatus: { $lt: minTime } })
			.toArray()
		await db
			.collection("participants")
			.deleteMany({ lastStatus: { $lt: minTime } })
		deletedParticipants.forEach(
			async ({ name }) =>
				await db.collection("messages").insertOne({
					from: name,
					to: "Todos",
					text: "sai da sala...",
					type: "status",
					time,
				})
		)
	} catch (error) {
		console.log(error)
	}
}, STATUSUPDATEINTERVAL)

app.listen(PORT, () => {
	console.log(`Server started on port ${PORT}`)
})
