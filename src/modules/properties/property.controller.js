const service = require("./property.service");
exports.listPublic = async (req, res) => res.json(await service.listPublic(req.query));
exports.getPublic = async (req, res) => res.json({ data: await service.getPublic(req.params.idOrSlug) });
exports.listAdmin = async (req, res) => res.json(await service.listAdmin(req.query));
exports.getAdmin = async (req, res) => res.json({ data: await service.getAdmin(req.params.id) });
exports.create = async (req, res) => res.status(201).json({ data: await service.create(req.body) });
exports.update = async (req, res) => res.json({ data: await service.update(req.params.id, req.body) });
