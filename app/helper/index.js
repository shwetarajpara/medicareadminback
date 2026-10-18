const connectToMongo = require('../connection/db');

// Escapes regex special characters so user-supplied search text is matched
// literally instead of being interpreted as a (potentially catastrophic) regex.
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Function to generate a success response
 * @param {object} res - The response object
 * @param {string} message - The success message
 * @param {object} data - The data to be returned
 * @returns {object} - The JSON response
 */

// let bassUrl = 'https://medicare-mllp.onrender.com/medicare/uploads/';
let bassUrl = 'https://medicare-qpen.onrender.com/medicare/uploads/';

const successResponse = (res, message = "success", data = [], baseUrl = false) => {
    let field = { status: 200, };
    if (baseUrl) field['url'] = bassUrl
    return res.status(200).json({ ...field, message: message, data: data });
}

/**
 * Function to generate an error response
 * @param {object} res - The response object
 * @param {string} message - The error message
 * @returns {object} - The JSON response
 */
const errorResponse = (res, message = "Something Went Wrong") => {
    return res.status(400).json({
        stsatus: 400,
        message: message
    });
}

/**
 * Function to save data to the database
 * @param {object} Model - The Mongoose model
 * @param {object} data - The data to be saved
 * @returns {object} - The saved data
 */
const saveModel = async (Model, data) => {
    try {
        const newData = new Model(data);
        const savedData = await newData.save();
        return savedData;
    } catch (error) {
        throw new Error(error.message);
    }
}

/**
 * Function to delete data from the database
 * @param {object} Model - The Mongoose model
 * @param {string} id - The ID of the document to be deleted
 * @returns {object} - The deleted data
 */
const deleteData = async (Model, id) => {
    try {
        const deletedData = await Model.findByIdAndDelete(id);
        if (!deletedData) {
            throw new Error("Data not found");
        }
        return deletedData;
    } catch (error) {
        throw new Error(error.message);
    }
}

/**
 * Function to select data from the database
 * @param {object} Model - The Mongoose model
 * @param {object} condition - The condition to filter the data
 * @param {string} fields - The fields to select
 * @returns {object} - The selected data
 */
const selectdata = async (Model, condition, fields) => {
    try {
        const data = await Model.find(condition).select(fields);
        return data;
    } catch (error) {
        throw new Error(error.message);
    }
}

const selectdatv2 = async (
    Model,
    condition,
    fields,
    limit = 10,
    offset = 0,
    searchFields = '',
    searchQuery = '',
    sortBy = {},
    joinModel = null
) => {
    try {
        // Work on a copy — the caller's condition object must not be mutated.
        condition = { ...condition };

        // Convert space-separated searchFields into an array
        const fieldsArray = searchFields ? searchFields.split(' ').map(field => field.trim()) : [];

        // Add multiple search fields functionality
        if (fieldsArray.length > 0 && searchQuery) {
            const schemaPaths = Model.schema.paths; // Get schema paths for the model

            // Build the $or condition dynamically, ensuring only string fields use $regex
            const searchOr = fieldsArray
                .filter((field) => schemaPaths[field]?.instance === 'String') // Only include string fields
                .map((field) => ({
                    [field]: { $regex: escapeRegex(searchQuery), $options: 'i' }, // Case-insensitive regex search
                }));

            // If condition already carries an $or (e.g. a tenant/scope clause),
            // assigning over it would silently drop that scope. Fold both
            // clauses under $and instead so neither is lost.
            if (searchOr.length > 0) {
                if (condition.$or) {
                    condition.$and = [...(condition.$and || []), { $or: condition.$or }, { $or: searchOr }];
                    delete condition.$or;
                } else {
                    condition.$or = searchOr;
                }
            }
        }

        // Get total records count (ignores limit and offset)
        const totalRecords = await Model.countDocuments(condition);

        // Query the data with limit, offset, and sort
        let query = Model.find(condition).select(fields).limit(limit).skip(offset).sort(sortBy);

        // Apply join (populate) if provided
        if (joinModel) {
            query = query.populate(joinModel);
        }

        const data = await query.exec();

        return {
            totalRecords,
            data
        };
    } catch (error) {
        throw new Error(error.message);
    }
};


/**
 * Function to select data from the database
 * @param {object} options - Options for querying the database
 * @param {object} options.Model - The Mongoose model to query
 * @param {object} [options.condition={}] - The conditions to filter the data
 * @param {string} [options.fields=''] - Space-separated fields to select
 * @param {number} [options.limit=10] - Maximum number of records to return
 * @param {number} [options.offset=0] - Number of records to skip
 * @param {string} [options.searchFields=''] - Fields to search in (space-separated)
 * @param {string} [options.searchQuery=''] - Search text for filtering
 * @param {object} [options.sortBy={}] - Fields to sort by
 * @param {object|array|string|null} [options.joinModel=null] - Population configuration (populate fields or options)
 * @returns {Promise<object>} - An object containing totalRecords and fetched data
 */
const selectdatawithjoin = async (options) => {
    try {
        let {
            Model,
            condition = {},
            fields = '',
            limit = 10,
            offset = 0,
            searchFields = '',
            searchQuery = '',
            sortBy = {},
            joinModel = null
        } = options;

        // Work on a copy — the caller's condition object must not be mutated.
        condition = { ...condition };

        // Convert space-separated searchFields into an array
        const fieldsArray = searchFields ? searchFields.split(' ').map(field => field.trim()) : [];

        // Add multiple search fields functionality
        if (fieldsArray.length > 0 && searchQuery) {
            const schemaPaths = Model.schema.paths; // Get schema paths for the model

            // Build the $or condition dynamically, ensuring only string fields use $regex
            const searchOr = fieldsArray
                .filter((field) => schemaPaths[field]?.instance === 'String')
                .map((field) => ({
                    [field]: { $regex: escapeRegex(searchQuery), $options: 'i' }, // Case-insensitive search
                }));

            // Fold into $and rather than overwrite, so a pre-existing $or
            // (e.g. a tenant/scope clause) on `condition` isn't clobbered.
            if (searchOr.length > 0) {
                if (condition.$or) {
                    condition.$and = [...(condition.$and || []), { $or: condition.$or }, { $or: searchOr }];
                    delete condition.$or;
                } else {
                    condition.$or = searchOr;
                }
            }
        }

        // Get total records count
        const totalRecords = await Model.countDocuments(condition);

        // Build the query
        let query = Model.find(condition)
            .select(fields)
            .limit(limit)
            .skip(offset)
            .sort(sortBy).lean();

        // Apply population if provided
        if (joinModel) {
            query = query.populate(joinModel);
        }

        const data = await query.exec();

        return {
            totalRecords,
            data
        };
    } catch (error) {
        throw new Error(error.message);
    }
};



/**
 * Function to update data in the database
 * @param {object} Model - The Mongoose model
 * @param {object} conditions - The conditions to find the document to be updated
 * @param {object} update - The data to update
 * @returns {object} - The updated data
 */
const updateModel = async (Model, conditions, update) => {
    try {
        const updatedData = await Model.findOneAndUpdate(conditions, update, { new: true });
        if (!updatedData) {
            throw new Error("Data not found");
        }
        return updatedData;
    } catch (error) {
        throw new Error(error.message);
    }
}

// Same as updateModel but runs Mongoose schema validators on the update.
// updateModel intentionally doesn't (changing that globally risks rejecting
// edits to pre-existing documents across the whole app) — use this only in
// newer modules where every write should be held to the schema.
const updateModelStrict = async (Model, conditions, update) => {
    try {
        const updatedData = await Model.findOneAndUpdate(conditions, update, {
            new: true, runValidators: true, context: 'query',
        });
        if (!updatedData) {
            throw new Error("Data not found");
        }
        return updatedData;
    } catch (error) {
        throw new Error(error.message);
    }
}



/**
 * validate middleware function to validate the request body against a provided schema.
 * - Validates the request body using the provided Joi schema.
 * - If validation fails, returns an error response with the validation error message.
 * - If validation passes, calls the next middleware function.
 *
 * @param {Object} schema - The Joi schema to validate the request body.
 * @returns {Function} Middleware function that validates the request body.
 */
const validate = schema => (req, res, next) => {
    const { error } = schema.validate(req.body)
    if (error) {
      const message = error.details.map(i => i.message).join(',')
      console.log('error', message)
      errorResponse(res, message)
    } else {
      next()
    }
  }

module.exports = {
    successResponse,
    errorResponse,
    saveModel,
    updateModel,
    updateModelStrict,
    deleteData,
    selectdata,
    selectdatv2,
    validate,
    selectdatawithjoin
};