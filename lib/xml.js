'use strict';

const _ = require('lodash');
const xml2js = require('xml2js');
const builder = new xml2js.Builder({
    attrkey: '@',
    xmldec: {
        version: '1.0',
        encoding: 'ISO-8859-1'
    },
    renderOpts: {
        pretty: false
    }
});

function visitEvery(fn) {
    return function visit(obj) {
        if (_.isObject(obj) && !_.isArray(obj)) {
            return fn(visit, obj);
        }

        if (_.isArray(obj)) {
            return _.map(obj, visit);
        }

        return obj;
    };
}

function arrayify(val) {
    if (_.isString(val) || _.isNumber(val)) {
        return val;
    }

    if (_.isArray(val)) {
        return _.flatMap(val, arrayify);
    }
    return _.reduce(val, function (memo, val, key) {
        return _.concat(memo, { [key]: val });
    }, []);
}

function isSimpleArray(val) {
    return _.isArray(val) && _.every(val, function (item, index) {
        return _.isString(item) || _.isNumber(item);
    });
}

function slurpDuplicates(val, key) {
    if (!_.isArray(val)) {
        return val;
    }

    return _.flatMap(val, function (item) {
        if (_.keys(item).length !== 1) {
            return [item];
        }

        const k = _.keys(item)[0];

        if (!_.isArray(item[k])) {
            return [item];
        }

        if (_.every(item[k], (subitem) => subitem[k])) {
            return item[k];
        }

        return [item];
    });
}

const removeDuplicates = visitEvery(function (visit, obj) {
    return _.mapValues(obj, function (val, key) {
        return visit(slurpDuplicates(val, key));
    });
});

const ensureArrays = visitEvery(function (visit, obj) {
    return _.mapValues(obj, function (val, key) {
        if (key === '_attr' || key === '_cdata' || !_.isObject(val)) {
            return val;
        }

        if (isSimpleArray(val)) {
            return _.reduce(val, function (memo, item) {
                return _.concat(memo, { [key]: item });
            }, []);
        }

        return visit(arrayify(val));
    });
});

const stripUndefined = visitEvery(function (visit, obj) {
    return _.reduce(obj, function (memo, val, key) {
        if (val !== undefined) {
            memo[key] = visit(val);
        }

        return memo;
    }, {});
});

const stripEmpty = visitEvery(function (visit, obj) {
    return _.reduce(obj, function (memo, val, key) {
        if (!_.isObject(val) || !_.isEmpty(val)) {
            memo[key] = visit(val);
        }

        return memo;
    }, {});
});

function AmazonEnvelope(data) {
    return {
        '@': {
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xsi:noNamespaceSchemaLocation': 'amzn-envelope.xsd'
        },
        Header: {
            DocumentVersion: 1.01,
            MerchantIdentifier: data.MerchantIdentifier
        },
        MessageType: data.MessageType,
        Message: data.Message
    };
}

function makeXML(data) {
    return builder.buildObject({AmazonEnvelope: data});
}

const createXML = _.flowRight(makeXML, removeDuplicates, stripEmpty, stripUndefined);

const createEnvelope = (fn) => (header, data) => createXML(AmazonEnvelope(fn(header, data)));

module.exports = {
    AmazonEnvelope,
    createEnvelope,
    createXML
};
