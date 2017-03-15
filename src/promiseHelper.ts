/**
 * Created by Jason on 3/8/17.
 */

import * as Promise from 'bluebird';

export class PromiseHelper {

    /**
     * Creates a looping promise function that takes a condition, action, and value
     * @returns {Function}
     */
    static createPromiseForMethod() {
        let promiseFor = Promise.method(function(condition, action, value) {
            if (!condition(value)) return value;
            return action(value).then(promiseFor.bind(null, condition, action));
        });
        return promiseFor;
    }
}