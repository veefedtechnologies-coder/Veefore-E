sed -i 's/expect(mockCreate).toHaveBeenCalledWith(/expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({/g' server/features/ai/services/openai.service.test.ts
sed -i 's/expect.objectContaining({/{/g' server/features/ai/services/openai.service.test.ts
sed -i 's/expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({/expect(mockCreate).toHaveBeenCalledWith(/g' server/features/ai/services/openai.service.test.ts
