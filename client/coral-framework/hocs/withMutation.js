import * as React from 'react';
import {graphql} from 'react-apollo';
import merge from 'lodash/merge';
import uniq from 'lodash/uniq';
import flatten from 'lodash/flatten';
import isEmpty from 'lodash/isEmpty';
import {getMutationOptions, resolveFragments} from 'coral-framework/services/graphqlRegistry';
import {getDefinitionName, getResponseErrors} from '../utils';
import PropTypes from 'prop-types';
import t from 'coral-framework/services/i18n';
import hoistStatics from 'recompose/hoistStatics';

class ResponseErrors extends Error {
  constructor(errors) {
    super(`Response Errors ${JSON.stringify(errors)}`);
    this.errors = errors.map((e) => new ResponseError(e));
  }
}

class ResponseError {
  constructor(error) {
    Object.assign(this, error);
  }

  translate(...args) {
    return t(`error.${this.translation_key}`, ...args);
  }
}

/**
 * Exports a HOC with the same signature as `graphql`, that will
 * apply mutation options registered in the graphRegistry.
 */
export default (document, config = {}) => hoistStatics((WrappedComponent) => {
  config = {
    ...config,
    options: config.options || {},
    props: config.props || ((data) => ({mutate: data.mutate()})),
  };

  return class WithMutation extends React.Component {
    static contextTypes = {
      eventEmitter: PropTypes.object,
      store: PropTypes.object,
    };

    // Lazily resolve fragments from graphRegistry to support circular dependencies.
    memoized = null;

    wrappedProps = (data) => {
      const name = getDefinitionName(document);
      const callbacks = getMutationOptions(name);
      const mutate = (base) => {
        const variables = base.variables || config.options.variables;
        const configs = callbacks.map((cb) => cb({variables, state: this.context.store.getState()}));

        const optimisticResponse = merge(
          base.optimisticResponse || config.options.optimisticResponse,
          ...configs.map((cfg) => cfg.optimisticResponse),
        );

        const refetchQueries = flatten(uniq([
          base.refetchQueries || config.options.refetchQueries,
          ...configs.map((cfg) => cfg.refetchQueries),
        ].filter((i) => i)));

        const updateCallbacks =
          [base.update || config.options.update]
          .concat(...configs.map((cfg) => cfg.update))
          .filter((i) => i);

        const update = (proxy, result) => {
          if (getResponseErrors(result)) {

            // Do not run updates when we have mutation errors.
            return;
          }
          updateCallbacks.forEach((cb) => cb(proxy, result));
        };

        const updateQueries =
          [
            base.updateQueries || config.options.updateQueries,
            ...configs.map((cfg) => cfg.updateQueries)
          ]
          .filter((i) => i)
          .reduce((res, map) => {
            Object.keys(map).forEach((key) => {
              if (!(key in res)) {
                res[key] = (prev, result) => {
                  if (getResponseErrors(result.mutationResult)) {

                    // Do not run updates when we have mutation errors.
                    return prev;
                  }
                  return map[key](prev, result) || prev;
                };
              } else {
                const existing = res[key];
                res[key] = (prev, result) => {
                  const next = existing(prev, result);
                  return map[key](next, result) || next;
                };
              }
            });
            return res;
          }, {});

        const wrappedConfig = {
          variables,
          optimisticResponse,
          refetchQueries,
          updateQueries,
          update,
        };
        if (isEmpty(wrappedConfig.optimisticResponse)) {
          delete wrappedConfig.optimisticResponse;
        }

        this.context.eventEmitter.emit(`mutation.${name}.begin`, {variables});

        return data.mutate(wrappedConfig)
          .then((res) => {
            const errors = getResponseErrors(res);
            if (errors) {
              throw new ResponseErrors(errors);
            }
            this.context.eventEmitter.emit(`mutation.${name}.success`, {variables, data: res.data});
            return Promise.resolve(res);
          })
          .catch((error) => {
            this.context.eventEmitter.emit(`mutation.${name}.error`, {variables, error});
            throw error;
          });
      };
      return config.props({...data, mutate});
    };

    getWrapped = () => {
      if (!this.memoized) {
        this.memoized = graphql(resolveFragments(document), {...config, props: this.wrappedProps})(WrappedComponent);
      }
      return this.memoized;
    };

    render() {
      const Wrapped = this.getWrapped();
      return <Wrapped {...this.props} />;
    }
  };
});
