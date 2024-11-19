import { atom, computed } from '@tldraw/state'
import { assert } from '@tldraw/utils'
import isEqual from 'lodash.isequal'
import { TlaFile, TlaFileState, TlaUser } from './tlaSchema'
import { ZRowUpdate, ZStoreData } from './types'

export class OptimisticAppStore {
	private _gold_store = atom('zero store', null as null | ZStoreData, {
		isEqual: isEqual,
	})

	private _optimisticStore = atom<
		Array<{
			updates: ZRowUpdate[]
			mutationId: string
		}>
	>('optimistic store', [])

	initialize(data: ZStoreData) {
		this._gold_store.set(data)
	}

	private store = computed('store', () => {
		const gold = this._gold_store.get()
		if (!gold) return null
		let data = gold
		const optimistic = this._optimisticStore.get()
		for (const changes of optimistic) {
			for (const update of changes.updates) {
				data = this.applyUpdate(data, update)
			}
		}
		return data
	})

	getCommittedData() {
		return this._gold_store.get()
	}

	updateCommittedData(data: ZRowUpdate) {
		this._gold_store.update((prev) => {
			if (!prev) return prev
			return this.applyUpdate(prev, data)
		})
	}

	getFullData() {
		return this.store.get()
	}

	updateOptimisticData(updates: ZRowUpdate[], mutationId: string) {
		this._optimisticStore.update((prev) => {
			if (!prev) return [{ updates, mutationId }]
			return [...prev, { updates, mutationId }]
		})
	}

	commitMutations(mutationIds: string[]) {
		this._optimisticStore.update((prev) => {
			if (!prev) return prev
			return prev.filter((p) => {
				return !mutationIds.includes(p.mutationId)
			})
		})
	}

	rejectMutation(mutationId: string) {
		this._optimisticStore.update((prev) => {
			if (!prev) return prev
			return prev.filter((p) => {
				return p.mutationId !== mutationId
			})
		})
	}

	applyUpdate(prev: ZStoreData, update: ZRowUpdate) {
		const { row, table, event } = update
		if (table === 'user') {
			return { ...prev, user: row as TlaUser }
		}
		if (table === 'file') {
			if (event === 'delete') {
				return {
					...prev,
					files: prev.files.filter((f) => f.id !== (row as TlaFile).id),
				}
			} else if (event === 'update') {
				return {
					...prev,
					files: prev.files.map((f) => (f.id === (row as TlaFile).id ? (row as TlaFile) : f)),
				}
			} else {
				assert(event === 'insert', 'invalid event')
				return {
					...prev,
					files: [...prev.files, row as TlaFile],
				}
			}
		}
		assert(table === 'file_state')
		const fileState = row as TlaFileState
		const { fileId, userId } = fileState
		if (event === 'delete') {
			return {
				...prev,
				fileStates: prev.fileStates.filter((f) => !(f.fileId === fileId && f.userId === userId)),
			}
		} else if (event === 'update') {
			return {
				...prev,
				fileStates: prev.fileStates.map((f) => {
					if (f.fileId === fileId && f.userId === userId) {
						return fileState
					}
					return f
				}),
			}
		} else {
			assert(event === 'insert', 'invalid event')
			return {
				...prev,
				fileStates: [...prev.fileStates, fileState],
			}
		}
	}
}