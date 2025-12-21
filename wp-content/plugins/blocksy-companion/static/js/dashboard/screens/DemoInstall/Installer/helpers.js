import { __ } from 'ct-i18n'

export const GENERIC_MESSAGE = __(
	"Unfortunately, your hosting configuration doesn't meet the minimum requirements for importing a starter site.",
	'blocksy-companion'
)

export const prepareUrl = (query_string) => {
	const params = new URLSearchParams({
		nonce: ctDashboardLocalizations.dashboard_actions_nonce,
		wp_customize: 'on',
		...query_string,
	})

	return `${ctDashboardLocalizations.ajax_url}?${params.toString()}`
}

const performSingleRequest = async (
	request,
	requestsPayload,
	extraBody = {},
	{ strategy = 'default', onStatus = null } = {}
) => {
	const url = prepareUrl(request.params)

	const headers = {
		'Content-Type': 'application/json',
	}

	if (strategy === 'sse') {
		headers['Accept'] = 'text/event-stream'
	}

	const response = await fetch(url, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			requestsPayload,
			...(request.body || {}),
			...extraBody,
		}),
	})

	if (strategy === 'sse') {
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`)
		}

		return parseSSEResponse(response, onStatus)
	}

	// Default strategy - parse JSON
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`)
	}

	const body = await response.json()

	if (!body || !body.success) {
		throw new Error(body?.data?.message || 'Unknown error')
	}

	return {
		success: true,
		data: body.data,
	}
}

const parseSSEResponse = async (response, onStatus) => {
	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''

	while (true) {
		const { done, value } = await reader.read()

		if (done) {
			break
		}

		buffer += decoder.decode(value, { stream: true })

		// Parse SSE events from buffer
		const lines = buffer.split('\n')
		buffer = lines.pop() || '' // Keep incomplete line in buffer

		let currentEvent = null
		let currentData = ''

		for (const line of lines) {
			if (line.startsWith('event: ')) {
				currentEvent = line.slice(7)
			} else if (line.startsWith('data: ')) {
				currentData = line.slice(6)
			} else if (line === '' && currentEvent && currentData) {
				// End of event
				try {
					const data = JSON.parse(currentData)

					if (currentEvent === 'status' && onStatus) {
						onStatus(data.message)
					} else if (currentEvent === 'complete') {
						return {
							success: true,
							data: data,
						}
					} else if (currentEvent === 'error') {
						throw new Error(data.message)
					}
				} catch (e) {
					if (e.message) {
						throw e
					}
					console.error('Failed to parse SSE data:', e)
				}

				currentEvent = null
				currentData = ''
			}
		}
	}

	throw new Error('SSE stream ended without complete event')
}

export const performRequestWithExponentialBackoff = async (
	request,
	requestsPayload,
	{ maxRetries = 5, strategy = 'default', onStatus = null } = {}
) => {
	let attempt = 0
	const label = request.title

	while (attempt < maxRetries) {
		// Run cleanup request before retry attempts (not on first attempt)
		if (attempt > 0 && request.cleanup) {
			console.log(`[${label}] Running cleanup before attempt ${attempt + 1}`)

			try {
				await performRequestWithExponentialBackoff(
					{
						title: `${label} (cleanup)`,
						params: request.cleanup.params,
					},
					{},
					{ maxRetries: 3 }
				)
				console.log(`[${label}] Cleanup completed`)
			} catch (e) {
				console.log(
					`[${label}] Cleanup failed: ${e.message}, continuing anyway`
				)
			}
		}

		// First attempt is immediate, second attempt is immediate,
		// then exponential backoff: 1s, 2s, 4s, ...
		if (attempt >= 2) {
			const delay = Math.pow(2, attempt - 2) * 1000
			console.log(
				`[${label}] Waiting ${delay}ms before attempt ${attempt + 1}`
			)
			await new Promise((resolve) => setTimeout(resolve, delay))
		}

		console.log(`[${label}] Attempt ${attempt + 1}/${maxRetries}`)
		const startTime = Date.now()

		let response
		try {
			response = await performSingleRequest(
				request,
				requestsPayload,
				{},
				{ strategy, onStatus }
			)
		} catch (e) {
			console.log(`[${label}] Attempt ${attempt + 1} failed: ${e.message}`)
			attempt++
			continue
		}

		const duration = Date.now() - startTime

		// Check for timeout/chunked response (SSE content import)
		if (
			strategy === 'sse' &&
			response.data?.status === 'content_import_timeout_reached'
		) {
			// Calculate safe duration: 70% of request time
			const safeDuration = Math.floor((duration * 0.7) / 1000)
			console.log(
				`[${label}] Timeout reached, continuing with chunked import (safe duration: ${safeDuration}s)`
			)

			let currentPayload = {
				...requestsPayload,
				importer_data: response.data.importer_data,
			}

			// Continue chunked import
			while (true) {
				console.log(
					`[${label}] Continuing chunked import (processed: ${response.data.total_processed}/${response.data.total_posts})`
				)

				let chunkResponse
				try {
					chunkResponse = await performSingleRequest(
						request,
						currentPayload,
						{ duration: safeDuration },
						{ strategy, onStatus }
					)
				} catch (e) {
					console.log(
						`[${label}] Chunked import failed: ${e.message}, restarting attempt`
					)
					break
				}

				// Another timeout - continue chunking
				if (
					chunkResponse.data?.status === 'content_import_timeout_reached'
				) {
					console.log(
						`[${label}] Chunk completed, more content remaining (processed: ${chunkResponse.data.total_processed}/${chunkResponse.data.total_posts})`
					)

					currentPayload = {
						...currentPayload,
						importer_data: chunkResponse.data.importer_data,
					}
					continue
				}

				// Success - content import complete
				console.log(`[${label}] Chunked import complete`)

				return {
					success: true,
					data: chunkResponse.data,
					requestsPayload: {
						...currentPayload,
						...chunkResponse.data,
					},
				}
			}

			// Chunked flow failed, restart attempt
			attempt++
			continue
		}

		// Normal success
		console.log(
			`[${label}] Success on attempt ${attempt + 1} (took ${duration}ms)`
		)

		let nextPayload = requestsPayload

		if (
			response.data &&
			response.data != null &&
			response.data.constructor.name === 'Object'
		) {
			nextPayload = {
				...requestsPayload,
				...response.data,
			}
		}

		return {
			success: true,
			data: response.data,
			requestsPayload: nextPayload,
		}
	}

	console.log(`[${label}] All ${maxRetries} attempts failed`)
	throw new Error(GENERIC_MESSAGE)
}
