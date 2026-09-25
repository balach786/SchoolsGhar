# ROLLBACK INSTRUCTIONS FOR PHASE 4D ARTIFACT CLEANUP
If the 12 deleted test Result artifacts need to be restored:
1. Connect to MongoDB using the maintenance script or Mongo shell.
2. Read `results-before.ejson`.
3. Convert the string IDs back to `ObjectId` and insert into `results` collection:
   `db.collection('results').insertMany(documents)`
4. Verify results count returns to 12.
