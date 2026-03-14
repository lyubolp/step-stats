/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    // steps collection
    const steps = new Collection({
        name: "steps",
        type: "base",
        fields: [
            {
                name: "date",
                type: "text",
                required: true,
            },
            {
                name: "count",
                type: "number",
                required: true,
                min: 0,
            },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_steps_date ON steps (date)"],
        createRule: "",
        listRule: "",
        viewRule: "",
        updateRule: "",
        deleteRule: "",
    });

    app.save(steps);

    // goals collection
    const goals = new Collection({
        name: "goals",
        type: "base",
        fields: [
            {
                name: "year",
                type: "number",
                required: true,
                min: 2000,
            },
            {
                name: "target",
                type: "number",
                required: true,
                min: 0,
            },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_goals_year ON goals (year)"],
        createRule: "",
        listRule: "",
        viewRule: "",
        updateRule: "",
        deleteRule: "",
    });

    app.save(goals);
}, (app) => {
    const steps = app.findCollectionByNameOrId("steps");
    app.delete(steps);

    const goals = app.findCollectionByNameOrId("goals");
    app.delete(goals);
});
