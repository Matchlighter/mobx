import { action, noop, die, isFunction, Annotation, isStringish, storeDecorator } from "../internal"

export const FLOW = "flow"

let generatorId = 0

export function FlowCancellationError() {
    this.message = "FLOW_CANCELLED"
}
FlowCancellationError.prototype = Object.create(Error.prototype)

export function isFlowCancellationError(error: Error) {
    return error instanceof FlowCancellationError
}

export type CancellablePromise<T> = Promise<T> & { cancel(): void }

interface Flow extends Annotation, PropertyDecorator {
    <R, Args extends any[]>(
        generator: (...args: Args) => Generator<any, R, any> | AsyncGenerator<any, R, any>
    ): (...args: Args) => CancellablePromise<R>
}

export const flow: Flow = Object.assign(
    function flow(arg1, arg2?) {
        // @flow
        if (isStringish(arg2)) {
            return storeDecorator(arg1, arg2, "flow")
        }
        // flow(fn)
        if (__DEV__ && arguments.length !== 1)
            die(`Flow expects 1 argument and cannot be used as decorator`)
        const generator = arg1
        const name = generator.name || "<unnamed flow>"

        // Implementation based on https://github.com/tj/co/blob/master/index.js
        const res = function () {
            const ctx = this
            const args = arguments
            const runId = ++generatorId
            const gen = action(`${name} - runid: ${runId} - init`, generator).apply(ctx, args)
            let rejector: (error: any) => void
            let pendingPromise: CancellablePromise<any> | undefined = undefined

            const promise = new Promise(function (resolve, reject) {
                let stepId = 0
                rejector = reject

                function onFulfilled(res: any) {
                    pendingPromise = undefined
                    let ret
                    try {
                        ret = action(
                            `${name} - runid: ${runId} - yield ${stepId++}`,
                            gen.next
                        ).call(gen, res)
                    } catch (e) {
                        return reject(e)
                    }

                    next(ret)
                }

                function onRejected(err: any) {
                    pendingPromise = undefined
                    let ret
                    try {
                        ret = action(
                            `${name} - runid: ${runId} - yield ${stepId++}`,
                            gen.throw!
                        ).call(gen, err)
                    } catch (e) {
                        return reject(e)
                    }
                    next(ret)
                }

                function next(ret: any) {
                    if (isFunction(ret?.then)) {
                        // an async iterator
                        ret.then(next, reject)
                        return
                    }
                    if (ret.done) return resolve(ret.value)
                    pendingPromise = Promise.resolve(ret.value) as any
                    return pendingPromise!.then(onFulfilled, onRejected)
                }

                onFulfilled(undefined) // kick off the process
            }) as any

            promise.cancel = action(`${name} - runid: ${runId} - cancel`, function () {
                try {
                    if (pendingPromise) cancelPromise(pendingPromise)
                    // Finally block can return (or yield) stuff..
                    const res = gen.return!(undefined as any)
                    // eat anything that promise would do, it's cancelled!
                    const yieldedPromise = Promise.resolve(res.value)
                    yieldedPromise.then(noop, noop)
                    cancelPromise(yieldedPromise) // maybe it can be cancelled :)
                    // reject our original promise
                    rejector(new FlowCancellationError())
                } catch (e) {
                    rejector(e) // there could be a throwing finally block
                }
            })
            return promise
        }
        res.isMobXFlow = true
        return res
    } as any,
    {
        annotationType_: "flow" as const
    }
)

function cancelPromise(promise) {
    if (isFunction(promise.cancel)) promise.cancel()
}

export function flowResult<T>(
    result: T
): T extends Generator<any, infer R, any>
    ? CancellablePromise<R>
    : T extends CancellablePromise<any>
    ? T
    : never {
    return result as any // just tricking TypeScript :)
}

export function isFlow(fn: any): boolean {
    return fn?.isMobXFlow === true
}
