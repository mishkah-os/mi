let largedb = {};


let smalldb = await Mishkah.utils.Net.get("../../r/j?tb=pos_database_view");smalldb= Mishkah.utils.helpers.getPureJson(smalldb);

// Inject `smal` data into `large`
let updateddb = Mishkah.utils.Data.deepMerge(largedb, { tables: { pos_database: [ { payload: smalldb[0] } ] } });

console.log(updateddb)
