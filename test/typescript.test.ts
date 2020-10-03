import fs from "fs"
describe("ts-jest setup", () => {
  it("should be able to compile", () => {
    expect(fs.existsSync("package.json")).toBeTruthy()
    let text = fs.readFileSync("package.json").toString()
    let json = JSON.parse(text)
    expect(json).toBeDefined()
  });
});

